import type { ConsoleId, ControllerId, HostId, PlayerId, RoomId } from '@foomerang/room-engine';
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
 *
 * Legacy rooms and console sessions (ADR-004) share the one generation counter and the one rule.
 */
export class BindingTable {
  #generation = 0;
  readonly #hosts = new Map<RoomId, Binding>();
  readonly #players = new Map<RoomId, Map<PlayerId, Binding>>();
  readonly #consoleHosts = new Map<ConsoleId, Binding>();
  readonly #controllers = new Map<ConsoleId, Map<ControllerId, Binding>>();

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
    const previous = inner(this.#players, roomId).get(playerId);
    inner(this.#players, roomId).set(playerId, { session, generation });
    session.identity = { kind: 'PLAYER', roomId, playerId, generation };
    return { superseded: previous && previous.session !== session ? previous.session : undefined };
  }

  bindConsoleHost(
    consoleId: ConsoleId,
    hostId: HostId,
    session: Session,
  ): { superseded: Session | undefined } {
    const generation = (this.#generation += 1);
    const previous = this.#consoleHosts.get(consoleId);
    this.#consoleHosts.set(consoleId, { session, generation });
    session.identity = { kind: 'CONSOLE_HOST', consoleId, hostId, generation };
    return { superseded: previous && previous.session !== session ? previous.session : undefined };
  }

  bindController(
    consoleId: ConsoleId,
    controllerId: ControllerId,
    session: Session,
  ): { superseded: Session | undefined } {
    const generation = (this.#generation += 1);
    const previous = inner(this.#controllers, consoleId).get(controllerId);
    inner(this.#controllers, consoleId).set(controllerId, { session, generation });
    session.identity = { kind: 'CONTROLLER', consoleId, controllerId, generation };
    return { superseded: previous && previous.session !== session ? previous.session : undefined };
  }

  /**
   * Called when `session` ends. Returns true — and unbinds — only if it still held the CURRENT
   * binding for its identity; false means it had been superseded (or never had an identity).
   */
  release(session: Session): boolean {
    const identity = session.identity;
    if (identity === undefined) return false;
    switch (identity.kind) {
      case 'HOST':
        return takeIfCurrent(this.#hosts, identity.roomId, identity.generation);
      case 'PLAYER':
        return takeIfCurrent(
          inner(this.#players, identity.roomId),
          identity.playerId,
          identity.generation,
        );
      case 'CONSOLE_HOST':
        return takeIfCurrent(this.#consoleHosts, identity.consoleId, identity.generation);
      case 'CONTROLLER':
        return takeIfCurrent(
          inner(this.#controllers, identity.consoleId),
          identity.controllerId,
          identity.generation,
        );
    }
  }

  /**
   * The identity ends while the connection may live on (left, removed, console closed): unbind it
   * and strip the connection's identity, so its eventual close is a no-op and it can never act for
   * that identity again.
   */
  detach(session: Session): void {
    this.release(session);
    session.identity = undefined;
  }

  hostSession(roomId: RoomId): Session | undefined {
    return this.#hosts.get(roomId)?.session;
  }

  /** Every player connection that currently speaks for a seat in the room. */
  playerSessions(roomId: RoomId): Session[] {
    return [...(this.#players.get(roomId)?.values() ?? [])].map((b) => b.session);
  }

  consoleHostSession(consoleId: ConsoleId): Session | undefined {
    return this.#consoleHosts.get(consoleId)?.session;
  }

  controllerSession(consoleId: ConsoleId, controllerId: ControllerId): Session | undefined {
    return this.#controllers.get(consoleId)?.get(controllerId)?.session;
  }

  /** Every controller connection currently bound in the console. */
  controllerSessions(consoleId: ConsoleId): Session[] {
    return [...(this.#controllers.get(consoleId)?.values() ?? [])].map((b) => b.session);
  }

  forgetRoom(roomId: RoomId): void {
    this.#hosts.delete(roomId);
    this.#players.delete(roomId);
  }

  forgetConsole(consoleId: ConsoleId): void {
    this.#consoleHosts.delete(consoleId);
    this.#controllers.delete(consoleId);
  }
}

function inner<K, I>(outer: Map<K, Map<I, Binding>>, key: K): Map<I, Binding> {
  let map = outer.get(key);
  if (map === undefined) {
    map = new Map();
    outer.set(key, map);
  }
  return map;
}

function takeIfCurrent<K>(map: Map<K, Binding>, key: K, generation: number): boolean {
  if (map.get(key)?.generation !== generation) return false;
  map.delete(key);
  return true;
}
