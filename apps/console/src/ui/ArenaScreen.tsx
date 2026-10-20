import { Suspense, lazy, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ConsoleRuntime } from '../consoleRuntime';
import type { ArenaRenderer, ArenaRendererLoader } from '../render/renderer';
import { FrameLoop } from '../runtime/frameLoop';
import type { HudView, ScoreEventView } from '../render/viewModel';
import { FocusManager, FocusScope } from '../shell/focus/FocusManager';
import { PauseMenu } from '../shell/screens/PauseMenu';
import '../shell/tokens.css';
import '../shell/components.css';
import { DebugOverlay } from './DebugOverlay';
import { ScoreStrip, ScoreToasts, type Pulse } from './Hud';

/**
 * The scoreboard between rounds and the results at the end are fetched apart from the first download (its budget): the
 * arena asks for them as soon as it opens, long before the first round can end.
 */
const loadScoreboard = () => import('./Scoreboard');
const loadResults = () => import('./Results');
const Scoreboard = lazy(() => loadScoreboard().then((m) => ({ default: m.Scoreboard })));
const ResultsScreen = lazy(() => loadResults().then((m) => ({ default: m.ResultsScreen })));
import { addScoreToasts, type ScoreToastState } from './scoreToasts';
import { useHostState } from './useStore';

// Module-level so their identity is stable: the effect below must not restart (and destroy the
// renderer) just because the screen re-rendered.
const defaultCreateLoop = (): FrameLoop => new FrameLoop();
const defaultNow = (): number => performance.now();

export interface ArenaScreenProps {
  readonly runtime: ConsoleRuntime;
  readonly loadRenderer: ArenaRendererLoader;
  readonly createLoop?: () => FrameLoop;
  readonly now?: () => number;
  readonly debugInitiallyOpen?: boolean;
  /** Told when the renderer appears and disappears (used by the DEV-only debug hook). */
  readonly onRenderer?: (renderer: ArenaRenderer | undefined) => void;
}

/**
 * React owns the chrome around the arena; it does not drive the game. The frame loop here only
 * asks the runtime to advance and hands the resulting view to the renderer. The renderer is
 * loaded lazily, so a lobby never pays for it.
 */
export function ArenaScreen({
  runtime,
  loadRenderer,
  createLoop = defaultCreateLoop,
  now = defaultNow,
  debugInitiallyOpen = false,
  onRenderer,
}: ArenaScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rendererFailed, setRendererFailed] = useState(false);
  const [debugOpen, setDebugOpen] = useState(debugInitiallyOpen);
  const state = useHostState(runtime.session);
  const [hud, setHud] = useState<HudView | undefined>(undefined);
  const [waiting, setWaiting] = useState<readonly string[]>([]);
  const [toasts, setToasts] = useState<readonly ScoreEventView[]>([]);
  const toastState = useRef<ScoreToastState>({ toasts: [], serial: 0 });
  const [pulses, setPulses] = useState<Readonly<Record<string, Pulse>>>({});
  const lastHud = useRef('');
  const context = useSyncExternalStore(runtime.subscribeContext, runtime.context);
  // The map of THIS match: a rematch on a rotating console is on another map, so the renderer is swapped.
  const arena = useSyncExternalStore(runtime.subscribeArena, runtime.arena);

  // fetch the between-rounds and end-of-match screens now, so they are there the moment they are needed
  useEffect(() => {
    void loadScoreboard().catch(() => undefined);
    void loadResults().catch(() => undefined);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    let cancelled = false;
    let renderer: ArenaRenderer | undefined;

    // The simulation starts immediately; it must not wait for the renderer to download.
    const loop = createLoop();
    loop.start(() => {
      runtime.frame(now());
      const view = runtime.director.arenaView();
      if (view === undefined) return;
      renderer?.render(view);
      const next = view.hud;
      if (next === undefined) return;
      // React re-renders only when what the HUD shows has changed, not on every frame
      const waitingNow = runtime.director.waitingForNextMatch().map((r) => r.displayName);
      const key = JSON.stringify([
        next.roundLabel,
        next.phase,
        next.entries.map((e) => [e.id, e.kills, e.label]),
        next.champion?.id,
        next.tiebreak,
        waitingNow,
      ]);
      if (key !== lastHud.current) {
        lastHud.current = key;
        setHud(next);
        setWaiting(waitingNow);
      }
      if (next.scoreEvents.length > 0) {
        const { added: fresh, ...kept } = addScoreToasts(toastState.current, next.scoreEvents);
        toastState.current = kept;
        setToasts(kept.toasts);
        setPulses((old) => ({
          ...old,
          ...Object.fromEntries(
            fresh.map((e) => [
              e.playerId,
              {
                kind: e.delta > 0 ? 'fill' : e.delta < 0 ? 'drain' : 'penalty',
                hole: e.delta > 0 ? e.kills - 1 : e.kills,
                key: e.key,
              } as Pulse,
            ]),
          ),
        }));
        window.setTimeout(() => {
          setToasts((old) => old.filter((t) => !fresh.includes(t)));
          setPulses((old) =>
            Object.fromEntries(
              Object.entries(old).filter(([, p]) => !fresh.some((e) => e.key === p.key)),
            ),
          );
        }, 2_200);
      }
    });

    loadRenderer(container, arena).then(
      (loaded) => {
        if (cancelled) {
          loaded.destroy();
          return;
        }
        renderer = loaded;
        onRenderer?.(loaded);
      },
      () => {
        if (!cancelled) setRendererFailed(true);
      },
    );

    return () => {
      cancelled = true;
      loop.stop();
      renderer?.destroy();
      renderer = undefined;
      onRenderer?.(undefined);
    };
  }, [runtime, arena, loadRenderer, createLoop, now, onRenderer]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'd' || event.key === 'D') setDebugOpen((open) => !open);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    // The phones (outside gameplay) and the TV's own keyboard / gamepad drive ONE focus system here
    // too: the pause menu and the champion screen are operated the same way as the shell.
    <FocusManager remote={runtime.menu}>
      <main className="screen arena-screen">
        {/* Nothing to focus while playing: Back (Esc / B) opens the pause menu. */}
        <FocusScope id="arena" onBack={() => runtime.pause()}>
          {null}
        </FocusScope>
        {/* the scoreboard stands alone over the arena, as in the reference */}
        {hud !== undefined && hud.phase !== 'SCOREBOARD' && hud.phase !== 'MATCH_OVER' && (
          <ScoreStrip hud={hud} pulses={pulses} />
        )}
        <div ref={containerRef} className="arena" data-testid="arena" />
        {hud?.phase !== 'SCOREBOARD' && hud?.phase !== 'MATCH_OVER' && (
          <ScoreToasts toasts={toasts} />
        )}
        {hud?.phase === 'SCOREBOARD' && (
          <Suspense fallback={null}>
            <Scoreboard hud={hud} onContinue={() => runtime.continueRound()} />
          </Suspense>
        )}
        {hud?.phase === 'MATCH_OVER' && (
          <Suspense fallback={null}>
            <ResultsScreen
              hud={hud}
              waiting={waiting}
              onRematch={() => runtime.rematch()}
              onLobby={() => runtime.returnToLobby()}
            />
          </Suspense>
        )}
        {hud !== undefined && hud.phase !== 'MATCH_OVER' && waiting.length > 0 && (
          <p className="muted waiting">Waiting for the next match: {waiting.join(', ')}</p>
        )}
        {state.phase === 'RECONNECTING' && (
          <p className="banner" role="status">
            Reconnecting to the game server…
          </p>
        )}
        {rendererFailed && (
          <p className="banner" role="alert">
            The arena could not be drawn in this browser.
          </p>
        )}
        <p className="hint muted">Press D for debug</p>
        {debugOpen && <DebugOverlay runtime={runtime} />}
      </main>
      <div className="fc fc--layer">
        <PauseMenu
          open={context === 'PAUSED'}
          onResume={() => runtime.resume()}
          onLeave={() => runtime.returnToLobby()}
        />
      </div>
    </FocusManager>
  );
}
