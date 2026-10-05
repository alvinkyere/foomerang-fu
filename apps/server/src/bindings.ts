import type { HostId, PlayerId, RoomId } from '@foomerang/room-engine';
import type { Session } from './session';

interface Binding {
  readonly session: Session;
  readonly generation: number;
}

/**
 * Which connection currently speaks for which identity.
 *
 * Every bind gets a fresh GENERATION. A connection whose generation is no longer the current one
 * for its identity has been superseded (a takeover), and losing it must not be treated as the
 * player or host disconnecting — that is the stale-close race:
 *
 *   phone A is P1 → phone B takes over P1 → A's socket reports "closed" late → ignore it.
 */
export class BindingTable {
  #generation = 0;
  readonly #hosts = new Map<RoomId, Binding>();
  readonly #players = new Map<RoomId, Map<PlayerId, Binding>>();

  bindHost(roomId: RoomId, hostId: HostId, session: Session): { superseded: Session | undefined } {
    const generation = (this.#generation += 1);
    const previous = this.#hosts.get(roomId);
    this.#hosts.set(roomId, { session, generation });
    session.identity = { kind: 'HOST', roomId, hostId, generation };
    return { superseded: previous && previous.session !== session ? previous.session : undefined };
  }

  bindPlayer(
    roomId: RoomId,
    playerId: PlayerId,
    session: Session,
  ): { superseded: Session | undefined } {
    const generation = (this.#generation += 1);
    let room = this.#players.get(roomId);
    if (room === undefined) {
      room = new Map();
      this.#players.set(roomId, room);
    }
    const previous = room.get(playerId);
    room.set(playerId, { session, generation });
    session.identity = { kind: 'PLAYER', roomId, playerId, generation };
    return { superseded: previous && previous.session !== session ? previous.session : undefined };
  }

  /**
   * Called when `session` ends. Returns true — and unbinds — only if it still held the CURRENT
   * binding for its identity; false means it had been superseded (or never had an identity).
   */
  release(session: Session): boolean {
    const identity = session.identity;
    if (identity === undefined) return false;
    if (identity.kind === 'HOST') {
      if (this.#hosts.get(identity.roomId)?.generation !== identity.generation) return false;
      this.#hosts.delete(identity.roomId);
      return true;
    }
    const room = this.#players.get(identity.roomId);
    if (room?.get(identity.playerId)?.generation !== identity.generation) return false;
    room.delete(identity.playerId);
    return true;
  }

  hostSession(roomId: RoomId): Session | undefined {
    return this.#hosts.get(roomId)?.session;
  }

  forgetRoom(roomId: RoomId): void {
    this.#hosts.delete(roomId);
    this.#players.delete(roomId);
  }
}
