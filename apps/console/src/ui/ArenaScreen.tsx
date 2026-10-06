import { useEffect, useRef, useState } from 'react';
import type { ConsoleRuntime } from '../consoleRuntime';
import type { ArenaRenderer, ArenaRendererLoader } from '../render/renderer';
import { FrameLoop } from '../runtime/frameLoop';
import { DebugOverlay } from './DebugOverlay';
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
      if (view !== undefined) renderer?.render(view);
    });

    loadRenderer(container).then(
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
  }, [runtime, loadRenderer, createLoop, now, onRenderer]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'd' || event.key === 'D') setDebugOpen((open) => !open);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <main className="screen arena-screen">
      <div ref={containerRef} className="arena" data-testid="arena" />
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
  );
}
