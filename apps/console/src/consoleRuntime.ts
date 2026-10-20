import { browserEnvironment, type SessionEnvironment } from '@foomerang/controller-sdk';
import type { ControllerContext, SecondaryActionLabel } from '@foomerang/protocol';
import { HostSession, type HostStore, type HostTransportFactory } from './host';
import { deriveContext } from './runtime/controllerContext';
import { InputRouter, type MenuAction } from './runtime/controllerInput';
import { MapRotation } from './runtime/mapRotation';
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
  /**
   * Which map Foomerang Fu is played on. A map name pins it (the product: the market plaza; the
   * page address's `?arena=` picks another for development and tests). `'rotate'`: a different
   * rendered map every match. Absent: the baseline test arena.
   */
  readonly arena?: ArenaChoice | 'rotate';
  /** The rotation's randomness, in [0, 1) (tests make it deterministic); default Math.random. */
  readonly random?: () => number;
  /** Which powers a Book may award (the page address's `?enable=`); default all five. */
  readonly enabled?: readonly PowerKind[];
  /** Test/playtest only (the page address's `?kills=`): fewer kills to win, so a match ends in seconds. Default 14. */
  readonly targetKills?: number;
  /** Each Foomerang Fu round's intro, READY … GO (the reference video: 2.84 s; the page address's `?intro=off`: none). Default none. */
  readonly roundIntroSeconds?: number;
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
  /** The map of the current (or last) Foomerang Fu match; undefined before any, or for another game. */
  readonly arena: () => ArenaChoice | undefined;
  /** Told whenever a match begins on a map (a rematch on a rotating console changes it). */
  readonly subscribeArena: (listener: () => void) => () => void;
  /** Told whenever the context changes (for the screens that follow it: the pause menu). */
  readonly subscribeContext: (listener: () => void) => () => void;
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
  /** CONTINUE on the scoreboard between rounds: the next round begins. */
  continueRound(): void;
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
  // Every match chooses its map here, so the rules and the renderer are told the same one.
  const rotation = new MapRotation(options.random);
  let arena: ArenaChoice | undefined;
  const arenaListeners = new Set<() => void>();
  const director = new MatchDirector((gameId, mode) => {
    const choice =
      gameId !== 'foomerang-fu'
        ? undefined
        : options.arena === 'rotate'
          ? rotation.next()
          : options.arena;
    arena = choice;
    for (const listener of [...arenaListeners]) listener();
    return createRuntimeFor(
      gameId,
      options.powerups,
      options.enabled,
      choice,
      mode,
      options.targetKills,
      options.roundIntroSeconds,
    );
  }, warmUpFor);
  const session = new HostSession({
    transportFactory: options.transportFactory,
    ...(options.store ? { store: options.store } : {}),
    ...(options.environment ? { environment: options.environment } : {}),
  });

  const menuListeners = new Set<MenuListener>();
  /** A Foomerang Fu room in its lobby is character select: every phone drives its own cursor there (game-setting.mp4). */
  const choosing = (): boolean => {
    const { gameId, roomState } = session.getState();
    return gameId === 'foomerang-fu' && roomState === 'LOBBY';
  };
  const humans = (): number =>
    session.getState().roster.filter((entry) => entry.seat === 'HELD').length;
  /** One phone's menu action on character select: its own cursor, its own READY, and (once everyone is) bots and begin. */
  const choose = (action: MenuAction, playerId: string): void => {
    const picks = director.picks;
    const pick = picks.pick(playerId);
    if (pick === undefined) return;
    if (action === 'select') {
      if (picks.select(playerId) === 'BEGIN') startMatch();
    } else if (action === 'back') picks.back(playerId);
    else if (action === 'left' || action === 'right') {
      if (!pick.ready) picks.move(playerId, action);
      else if (picks.allReady) {
        // the begin bar's ‹ BOTS ›: one more, or one fewer (the last added)
        if (action === 'right') director.cpus.add('MEDIUM', humans());
        else {
          const last = director.cpus.entries.at(-1);
          if (last !== undefined) director.cpus.remove(last.id);
        }
      }
    } else if (action === 'up' || action === 'down') picks.move(playerId, action);
  };
  const router = new InputRouter({
    ownCursors: choosing,
    // the phone's PAUSE button: anyone may pause a running match, and anyone may resume it
    system: () => {
      if (router.context === 'GAMEPLAY') pause();
      else if (router.context === 'PAUSED') resume();
    },
    // looked up on every call: the director's handlers are the game's input path, unchanged
    gameplay: {
      move: (playerId, x, y, nowMs) => director.onMovement(playerId, x, y, nowMs),
      action: (action) => director.onAction(action),
    },
    menu: (action, playerId) => {
      if (choosing()) {
        choose(action, playerId);
        return;
      }
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
  const contextListeners = new Set<() => void>();
  const syncContext = (): void => {
    const context = deriveContext({
      roomState: session.getState().roomState,
      manualPaused: director.manualPaused,
      matchPhase: director.matchPhase(),
    });
    const changed = context !== router.context;
    router.setContext(context, now());
    if (changed) for (const listener of [...contextListeners]) listener();
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

  function startMatch(): void {
    const { gameId } = session.getState();
    if (gameId === 'foomerang-fu' && director.startBlock() !== undefined) return;
    session.startMatch();
  }

  function pause(): void {
    if (!director.inMatch || session.getState().roomState !== 'PLAYING') return;
    director.setManualPause(true, now());
    syncContext();
  }

  function resume(): void {
    director.setManualPause(false, now());
    syncContext();
  }

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
    arena: () => arena,
    subscribeArena: (listener) => {
      arenaListeners.add(listener);
      return () => void arenaListeners.delete(listener);
    },
    subscribeContext: (listener) => {
      contextListeners.add(listener);
      return () => void contextListeners.delete(listener);
    },
    pause,
    resume,
    setSecondaryAction: (label) => {
      secondary = label;
      syncContext();
    },
    frame: (nowMs) => {
      director.frame(nowMs);
      // the phones feel the border (time outside it): the game runtime plans each rumble
      if (!director.paused)
        for (const r of director.runtime.rumbles?.(nowMs) ?? [])
          session.rumble(r.playerId, r.intensity, r.durationMs);
      syncContext(); // the match may have just ended: RESULTS
    },
    startMatch,
    continueRound: () => {
      director.continueRound();
      syncContext(); // back to the game's controls
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
      contextListeners.clear();
      arenaListeners.clear();
      session.dispose();
    },
  };
}
