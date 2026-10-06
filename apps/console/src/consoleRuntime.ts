import type { SessionEnvironment } from '@foomerang/controller-sdk';
import { HostSession, type HostStore, type HostTransportFactory } from './host';
import { MatchDirector, createRuntimeFor, warmUpFor } from './runtime/matchDirector';
import type { PowerKind } from '@foomerang/foomerang-fu';
import type { PowerupMode } from './runtime/powerupMode';

export interface ConsoleRuntimeOptions {
  readonly transportFactory: HostTransportFactory;
  readonly store?: HostStore;
  readonly environment?: SessionEnvironment;
  /** The host's own monotonic clock, in ms. */
  readonly now?: () => number;
  /** How quickly Foomerang Fu's pickups appear (the page address's `?powerups=`); default normal. */
  readonly powerups?: PowerupMode;
  /** Which powers a Book may award (the page address's `?enable=`); default all five. */
  readonly enabled?: readonly PowerKind[];
}

export interface ConsoleRuntime {
  readonly session: HostSession;
  readonly director: MatchDirector;
  /** Advance the simulation to host time `nowMs`. Called once per rendered frame. */
  frame(nowMs: number): void;
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
    (gameId) => createRuntimeFor(gameId, options.powerups, options.enabled),
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
  });

  return {
    session,
    director,
    frame: (nowMs) => director.frame(nowMs),
    dispose: () => session.dispose(),
  };
}
