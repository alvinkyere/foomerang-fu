import type { SessionEnvironment } from '@foomerang/controller-sdk';
import { HostSession, type HostStore, type HostTransportFactory } from './host';
import { MatchDirector, createRuntimeFor, warmUpFor } from './runtime/matchDirector';
import type { PowerKind } from '@foomerang/foomerang-fu';
import type { ArenaChoice, PowerupMode } from './runtime/powerupMode';

export interface ConsoleRuntimeOptions {
  readonly transportFactory: HostTransportFactory;
  readonly store?: HostStore;
  readonly environment?: SessionEnvironment;
  /** The host's own monotonic clock, in ms. */
  readonly now?: () => number;
  /** How quickly Foomerang Fu's pickups appear (the page address's `?powerups=`); default normal. */
  readonly powerups?: PowerupMode;
  /** Which arena Foomerang Fu is played in (the page address's `?arena=`); default the baseline arena. */
  readonly arena?: ArenaChoice;
  /** Which powers a Book may award (the page address's `?enable=`); default all five. */
  readonly enabled?: readonly PowerKind[];
  /** Test/playtest only (the page address's `?kills=`): fewer kills to win, so a match ends in seconds. Default 14. */
  readonly targetKills?: number;
}

export interface ConsoleRuntime {
  readonly session: HostSession;
  readonly director: MatchDirector;
  /** Advance the simulation to host time `nowMs`. Called once per rendered frame. */
  frame(nowMs: number): void;
  /** Ask the server to begin the match, unless the chosen mode or the table (participants, humans and CPUs together) cannot start. */
  startMatch(): void;
  /** REMATCH: the same participants and CPU difficulties, a brand-new match. */
  rematch(): void;
  /** Leave the finished match: the room goes back to its lobby. */
  returnToLobby(): void;
  dispose(): void;
}

/**
 * The composition root of the console's non-visual half:
 *
 *   server ─► HostSession ─► MatchDirector ─► (GameRuntime | FuRuntime) ─► game-core / Fu rules
 *
 * It is the only place that wires them together, and it knows nothing about React or Phaser.
 */
export function createConsoleRuntime(options: ConsoleRuntimeOptions): ConsoleRuntime {
  const now = options.now ?? ((): number => performance.now());
  const director = new MatchDirector(
    (gameId, mode) =>
      createRuntimeFor(
        gameId,
        options.powerups,
        options.enabled,
        options.arena,
        mode,
        options.targetKills,
      ),
    warmUpFor,
  );
  const session = new HostSession({
    transportFactory: options.transportFactory,
    ...(options.store ? { store: options.store } : {}),
    ...(options.environment ? { environment: options.environment } : {}),
  });

  session.onMovement((playerId, x, y) => director.onMovement(playerId, x, y, now()));
  session.onAction((action) => director.onAction(action));
  session.subscribe(() => {
    const { roomState, roster, gameId } = session.getState();
    if (roomState !== undefined) director.onRoom(roomState, roster, now(), gameId);
    // If the console's own connection to the server is down the match waits where it is, and resumes where it was
    // (a page that is gone loses the match: the session ends it when it reclaims the room).
    director.setPaused(session.getState().phase === 'RECONNECTING', now());
  });

  return {
    session,
    director,
    frame: (nowMs) => director.frame(nowMs),
    startMatch: () => {
      const { gameId } = session.getState();
      if (gameId === 'foomerang-fu' && director.startBlock() !== undefined) return;
      session.startMatch();
    },
    rematch: () => director.rematch(now()),
    returnToLobby: () => {
      director.returnToLobby();
      session.endMatch();
    },
    dispose: () => session.dispose(),
  };
}
