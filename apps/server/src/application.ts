import {
  controllerManifestSchema,
  type ControlDescriptor,
  type ControllerOrientation,
  type ErrorCode,
  type HeartbeatMessage,
  type InputEventMessage,
  type InputMoveMessage,
  type ServerMessage,
} from '@foomerang/protocol';
import type { PlayerId, Room, RoomId, RoomRegistry } from '@foomerang/room-engine';
import type { BindingTable } from './bindings';
import { BoundedEventWindow } from './dedup';
import type { Diagnostics } from './diagnostics';
import type { Session } from './session';
import {
  CREATE_ROOM_ERRORS,
  JOIN_ERRORS,
  RECONNECT_HOST_ERRORS,
  RECONNECT_PLAYER_ERRORS,
  TRANSITION_ERRORS,
} from './translation';

/**
 * What the platform needs to know about a game: its capacity, and the controller it wants phones
 * to render. The controller is DATA delivered to phones as a manifest; the platform has no
 * per-game logic.
 */
export interface GameDefinition {
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly controller: {
    readonly orientation: ControllerOrientation;
    readonly controls: readonly ControlDescriptor[];
  };
}

export const DEFAULT_GAMES: Readonly<Record<string, GameDefinition>> = Object.freeze({
  // Foomerang Fu: MOVE (joystick), SLASH (the PRIMARY action: the close-range panic button, which
  // controllers make biggest), THROW (the SECONDARY action) and DASH (the TERTIARY action). The server stays game-agnostic and
  // cannot import the game package, so this literal is checked against the game's own table
  // (FU_CONTROLS, which the console uses) by integration/test/fu-contract.integration.test.ts.
  'foomerang-fu': {
    minPlayers: 2,
    maxPlayers: 6,
    controller: {
      orientation: 'landscape',
      controls: [
        { id: 'MOVE', type: 'joystick' },
        { id: 'SLASH', type: 'button', action: 'PRIMARY' },
        { id: 'THROW', type: 'button', action: 'SECONDARY' },
        { id: 'DASH', type: 'button', action: 'TERTIARY' },
      ],
    },
  },
  // TEST / INTEGRATION INFRASTRUCTURE, not a game: circles that follow thumbs, so one phone can
  // prove the platform. It must never appear in a consumer game catalogue.
  'primitive-arena': {
    minPlayers: 1,
    maxPlayers: 6,
    controller: { orientation: 'landscape', controls: [{ id: 'MOVE', type: 'joystick' }] },
  },
});

/** Fails fast, at server creation, on a game whose controller phones could not render. */
export function validateGames(
  games: Readonly<Record<string, GameDefinition>>,
): ReadonlyMap<string, GameDefinition> {
  const validated = new Map<string, GameDefinition>();
  for (const [gameId, game] of Object.entries(games)) {
    controllerManifestSchema.parse({ gameId, ...game.controller });
    validated.set(gameId, game);
  }
  return validated;
}

export interface ApplicationDeps {
  readonly registry: RoomRegistry;
  readonly bindings: BindingTable;
  readonly games: ReadonlyMap<string, GameDefinition>;
  readonly diagnostics: Diagnostics;
  /** How many recent action-event ids are remembered per player. */
  readonly eventWindowCapacity: number;
}

/**
 * Room coordination: turns AUTHORIZED, already-parsed requests into room-engine operations and
 * sends the results. It never sees a socket — only sessions — and it knows nothing about how
 * messages travel or how a session was authorized.
 *
 * Translation seam: room-engine result → (translation.ts) → protocol ErrorCode.
 */
export class Application {
  readonly #deps: ApplicationDeps;
  /** Per-player action dedup, keyed by identity (so it survives reconnects). Bounded per player and pruned with the room. */
  readonly #eventWindows = new Map<RoomId, Map<PlayerId, BoundedEventWindow>>();

  constructor(deps: ApplicationDeps) {
    this.#deps = deps;
  }

  createRoom(session: Session, gameId: string): void {
    const game = this.#deps.games.get(gameId);
    if (game === undefined) return this.#error(session, 'UNKNOWN_GAME');

    const created = this.#deps.registry.createRoom({
      gameId,
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers,
    });
    if (!created.ok) return this.#error(session, CREATE_ROOM_ERRORS[created.reason]);

    const room = created.value;
    this.#deps.bindings.bindHost(room.roomId, room.host.hostId, session);
    session.send({
      type: 'ROOM_CREATED',
      payload: { joinCode: room.joinCode, hostToken: room.host.hostToken.reveal() },
    });
    this.#notifyHost(room.roomId);
  }

  joinRoom(session: Session, joinCode: string, displayName: string): void {
    const joined = this.#deps.registry.joinByCode(joinCode, displayName);
    if (!joined.ok) return this.#error(session, JOIN_ERRORS[joined.reason]);

    const { room, player } = joined.value;
    this.#deps.bindings.bindPlayer(room.roomId, player.playerId, session);
    session.send({
      type: 'ROOM_JOINED',
      payload: { playerId: player.playerId, reconnectToken: player.reconnectToken.reveal() },
    });
    this.#sendManifest(session, room);
    this.#notifyHost(room.roomId);
  }

  reconnectPlayer(session: Session, joinCode: string, reconnectToken: string): void {
    const found = this.#deps.registry.findByJoinCode(joinCode);
    if (found === undefined) return this.#error(session, 'ROOM_NOT_FOUND');

    const result = this.#deps.registry.reconnectPlayer(found.roomId, reconnectToken);
    if (!result.ok) return this.#error(session, RECONNECT_PLAYER_ERRORS[result.reason]);

    const { player } = result.value;
    const { superseded } = this.#deps.bindings.bindPlayer(found.roomId, player.playerId, session);
    this.#supersede(superseded);
    session.send({
      type: 'PLAYER_RECONNECTED',
      payload: { playerId: player.playerId, reconnectToken: player.reconnectToken.reveal() },
    });
    this.#sendManifest(session, result.value.room);
    this.#notifyHost(found.roomId);
  }

  reconnectHost(session: Session, joinCode: string, hostToken: string): void {
    const found = this.#deps.registry.findByJoinCode(joinCode);
    if (found === undefined) return this.#error(session, 'ROOM_NOT_FOUND');

    const result = this.#deps.registry.reconnectHost(found.roomId, hostToken);
    if (!result.ok) return this.#error(session, RECONNECT_HOST_ERRORS[result.reason]);

    const room = result.value.room;
    const { superseded } = this.#deps.bindings.bindHost(found.roomId, room.host.hostId, session);
    this.#supersede(superseded);
    session.send({
      type: 'HOST_RECONNECTED',
      payload: { joinCode: room.joinCode, hostToken: room.host.hostToken.reveal() },
    });
    this.#notifyHost(found.roomId);
  }

  /**
   * The host begins the match: LOBBY → STARTING → PLAYING. The primitive arena has no countdown,
   * so both steps happen together. Failure leaves the room exactly as it was.
   */
  startMatch(session: Session): void {
    const identity = session.identity;
    if (identity?.kind !== 'HOST') return;
    const starting = this.#deps.registry.beginStart(identity.roomId);
    if (!starting.ok) return this.#error(session, TRANSITION_ERRORS[starting.reason]);
    const playing = this.#deps.registry.startPlaying(identity.roomId);
    if (!playing.ok) return this.#error(session, 'INTERNAL_ERROR');
    this.#notifyHost(identity.roomId);
  }

  routeMove(session: Session, message: InputMoveMessage): void {
    const identity = session.identity;
    if (identity?.kind !== 'PLAYER') return;
    const host = this.#host(identity.roomId);
    if (host === undefined) return;
    host.send({
      type: 'PLAYER_INPUT',
      payload: {
        playerId: identity.playerId,
        input: { kind: 'MOVE', seq: message.seq, ...message.payload },
      },
    });
    this.#deps.diagnostics.increment('movementRouted');
  }

  routeEvent(session: Session, message: InputEventMessage): void {
    const identity = session.identity;
    if (identity?.kind !== 'PLAYER') return;
    const host = this.#host(identity.roomId);
    if (host === undefined) return; // not remembered, so a later retry can still get through
    if (this.#window(identity.roomId, identity.playerId).record(message.eventId) === 'DUPLICATE') {
      this.#deps.diagnostics.increment('duplicateEventsDiscarded');
      return;
    }
    host.send({
      type: 'PLAYER_INPUT',
      payload: {
        playerId: identity.playerId,
        input: {
          kind: 'ACTION',
          eventId: message.eventId,
          action: message.payload.action,
          phase: message.payload.phase,
        },
      },
    });
    this.#deps.diagnostics.increment('eventsRouted');
  }

  heartbeat(session: Session, message: HeartbeatMessage): void {
    this.#deps.diagnostics.increment('heartbeats');
    session.send({ type: 'HEARTBEAT_ACK', seq: message.seq });
  }

  /**
   * A transport ended. Only the connection that CURRENTLY speaks for an identity can disconnect
   * it; a superseded connection's late close is ignored (the stale-close race).
   */
  sessionClosed(session: Session): void {
    const identity = session.identity;
    if (identity === undefined) return;
    if (!this.#deps.bindings.release(session)) {
      this.#deps.diagnostics.increment('staleClosesIgnored');
      return;
    }
    if (identity.kind === 'PLAYER') {
      this.#deps.registry.disconnectPlayer(identity.roomId, identity.playerId);
      this.#notifyHost(identity.roomId);
    } else {
      this.#deps.registry.disconnectHost(identity.roomId);
    }
  }

  /** Housekeeping: advance every room to now and tell hosts what changed. Correctness never depends on it. */
  reconcileSweep(): void {
    for (const room of this.#deps.registry.reconcile()) this.#notifyHost(room.roomId);
    for (const roomId of [...this.#eventWindows.keys()]) {
      if (this.#deps.registry.getRoom(roomId) === undefined) {
        this.#eventWindows.delete(roomId);
        this.#deps.bindings.forgetRoom(roomId);
      }
    }
  }

  // ---------------------------------------------------------------------------------------

  /** Tells a controller what to render, from the GAME's definition. */
  #sendManifest(session: Session, room: Room): void {
    const game = this.#deps.games.get(room.config.gameId);
    if (game === undefined) return;
    session.send({
      type: 'CONTROLLER_MANIFEST',
      payload: {
        gameId: room.config.gameId,
        orientation: game.controller.orientation,
        controls: [...game.controller.controls],
      },
    });
  }

  #error(session: Session, code: ErrorCode): void {
    session.send({ type: 'ERROR', payload: { code } });
  }

  #host(roomId: RoomId): Session | undefined {
    const host = this.#deps.bindings.hostSession(roomId);
    if (host === undefined || host.lifecycle !== 'ACTIVE') {
      this.#deps.diagnostics.increment('inputDroppedNoHost');
      return undefined;
    }
    return host;
  }

  /** The previous connection for this identity loses it. Its eventual close event will be ignored. */
  #supersede(previous: Session | undefined): void {
    if (previous === undefined) return;
    this.#deps.diagnostics.increment('takeovers');
    previous.close();
  }

  #window(roomId: RoomId, playerId: PlayerId): BoundedEventWindow {
    let room = this.#eventWindows.get(roomId);
    if (room === undefined) {
      room = new Map();
      this.#eventWindows.set(roomId, room);
    }
    let window = room.get(playerId);
    if (window === undefined) {
      window = new BoundedEventWindow(this.#deps.eventWindowCapacity);
      room.set(playerId, window);
    }
    return window;
  }

  #notifyHost(roomId: RoomId): void {
    const host = this.#deps.bindings.hostSession(roomId);
    const room = this.#deps.registry.getRoom(roomId);
    if (host === undefined || room === undefined) return;
    host.send(rosterMessage(room));
  }
}

/** Domain room → wire roster. Carries identities and statuses only: never a credential. */
function rosterMessage(room: Room): ServerMessage {
  return {
    type: 'ROOM_UPDATED',
    payload: {
      joinCode: room.joinCode,
      state: room.state,
      hostConnection: room.host.connection.status,
      players: room.players.map((player) => ({
        playerId: player.playerId,
        displayName: player.displayName,
        connection: player.connection.status,
        seat: player.membership.status,
      })),
    },
  };
}
