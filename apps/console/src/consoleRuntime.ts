import { browserEnvironment, type SessionEnvironment } from '@foomerang/controller-sdk';
import type { ControllerContext, SecondaryActionLabel } from '@foomerang/protocol';
import { HostSession, type HostStore, type HostTransportFactory } from './host';
import { deriveContext } from './runtime/controllerContext';
import { InputRouter, type MenuAction } from './runtime/controllerInput';
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
  /** Repeat held sticks on a timer while the phones drive the console (default on; tests turn it off and drive time themselves). */
  readonly inputPump?: boolean;
}

export type MenuListener = (action: MenuAction, playerId: string) => void;

/** Phone input that means "the console", not the game: the shell's focus system subscribes to it. */
export interface MenuInput {
  subscribe(listener: MenuListener): () => void;
}

export interface ConsoleRuntime {
  readonly session: HostSession;
  readonly director: MatchDirector;
  /** Phone input outside gameplay (navigate / select / back / secondary), in arrival order. */
  readonly menu: MenuInput;
  /** What the phones' controls mean right now. */
  readonly context: () => ControllerContext;
  /** Open the pause menu: only while a match is being played. The game truly freezes. */
  pause(): void;
  /** Close the pause menu: the match continues from where it stood. */
  resume(): void;
  /** Offer (or withdraw, with null) the console's one secondary action on the phones' DASH button. */
  setSecondaryAction(label: SecondaryActionLabel | null): void;
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

  const menuListeners = new Set<MenuListener>();
  const router = new InputRouter({
    // looked up on every call: the director's handlers are the game's input path, unchanged
    gameplay: {
      move: (playerId, x, y, nowMs) => director.onMovement(playerId, x, y, nowMs),
      action: (action) => director.onAction(action),
    },
    menu: (action, playerId) => {
      for (const listener of [...menuListeners]) {
        try {
          listener(action, playerId);
        } catch {
          // one bad consumer must not break the others
        }
      }
    },
  });
  let secondary: SecondaryActionLabel | null = null;

  /** The host is the authority on what the controls mean: re-derived whenever anything it depends on may have changed. */
  const syncContext = (): void => {
    const context = deriveContext({
      roomState: session.getState().roomState,
      manualPaused: director.manualPaused,
      matchPhase: director.matchPhase(),
    });
    router.setContext(context, now());
    session.setContext(context, secondary === null ? null : { label: secondary });
  };

  const connected = new Set<string>();
  session.onMovement((playerId, x, y, seq) => router.onMove(playerId, seq, x, y, now()));
  session.onAction((action) => router.onAction(action, now()));
  session.subscribe(() => {
    const { roomState, roster, gameId } = session.getState();
    if (roomState !== undefined) director.onRoom(roomState, roster, now(), gameId);
    // If the console's own connection to the server is down the match waits where it is, and resumes where it was
    // (a page that is gone loses the match: the session ends it when it reclaims the room).
    director.setPaused(session.getState().phase === 'RECONNECTING', now());
    // a phone that dropped starts a brand-new input stream when it comes back
    const nowConnected = new Set(
      roster.filter((p) => p.connection === 'CONNECTED').map((p) => p.playerId),
    );
    for (const playerId of connected) {
      if (!nowConnected.has(playerId)) router.playerGone(playerId);
    }
    connected.clear();
    for (const playerId of nowConnected) connected.add(playerId);
    syncContext();
  });

  const stopPump =
    options.inputPump === false
      ? undefined
      : (options.environment ?? browserEnvironment).scheduler.setInterval(
          () => router.tick(now()),
          1000 / 60,
        );

  syncContext();

  return {
    session,
    director,
    menu: {
      subscribe(listener) {
        menuListeners.add(listener);
        return () => menuListeners.delete(listener);
      },
    },
    context: () => router.context,
    pause: () => {
      if (!director.inMatch || session.getState().roomState !== 'PLAYING') return;
      director.setManualPause(true, now());
      syncContext();
    },
    resume: () => {
      director.setManualPause(false, now());
      syncContext();
    },
    setSecondaryAction: (label) => {
      secondary = label;
      syncContext();
    },
    frame: (nowMs) => {
      director.frame(nowMs);
      syncContext(); // the match may have just ended: RESULTS
    },
    startMatch: () => {
      const { gameId } = session.getState();
      if (gameId === 'foomerang-fu' && director.startBlock() !== undefined) return;
      session.startMatch();
    },
    rematch: () => {
      director.rematch(now());
      syncContext();
    },
    returnToLobby: () => {
      director.returnToLobby();
      session.endMatch();
      syncContext();
    },
    dispose: () => {
      stopPump?.();
      menuListeners.clear();
      session.dispose();
    },
  };
}
