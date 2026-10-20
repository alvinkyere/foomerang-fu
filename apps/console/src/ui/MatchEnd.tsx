import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { HudView } from '../render/viewModel';
import { MATCH_END_TIMING as T } from './matchEndTiming';
import { ResultsScreen } from './Results';
import { Scoreboard } from './Scoreboard';
import './matchEnd.css';

export { MATCH_END_TIMING } from './matchEndTiming';

type Stage = 'beat' | 'iris' | 'board' | 'out' | 'results';

/**
 * The end of a match, played as the reference footage plays it ("foomerang - fu physics.mp4", a Coffee win; every timing in
 * matchEndTiming.ts): a beat after the deciding kill, an iris closes on the winner where they stand; the final scoreboard
 * alone on the dark (the winner's band pops, the others fade); then the arena again behind it, dimmed, and CONTINUE; CONTINUE
 * clears the board and the results play in. Presentation only: the match was decided by the rules the moment the last
 * hole filled.
 */
export function MatchEnd({
  hud,
  waiting,
  locate,
  onRematch,
  onLobby,
}: {
  readonly hud: HudView;
  readonly waiting: readonly string[];
  /** Where a player is on screen (fractions of the viewport), when the renderer can tell. */
  readonly locate: (id: string) => { readonly x: number; readonly y: number } | undefined;
  readonly onRematch: () => void;
  readonly onLobby: () => void;
}) {
  const winnerId = hud.champion?.id;
  const [stage, setStage] = useState<Stage>('beat');
  const [arenaBack, setArenaBack] = useState(false);
  const [at, setAt] = useState({ x: 0.5, y: 0.5 });
  const locateRef = useRef(locate);
  useLayoutEffect(() => {
    locateRef.current = locate;
  });

  useEffect(() => {
    const timers = [
      setTimeout(() => {
        if (winnerId !== undefined) {
          const p = locateRef.current(winnerId);
          if (p !== undefined) setAt({ x: p.x, y: p.y });
        }
        setStage('iris');
      }, T.beatMs),
      setTimeout(() => setStage('board'), T.beatMs + T.irisMs),
      setTimeout(() => setArenaBack(true), T.beatMs + T.irisMs + T.darkMs),
    ];
    return () => timers.forEach(clearTimeout);
  }, [winnerId]);

  useEffect(() => {
    if (stage !== 'out') return undefined;
    const timer = setTimeout(() => setStage('results'), T.boardOutMs);
    return () => clearTimeout(timer);
  }, [stage]);

  // during the iris the arena shows inside the closing circle; the board stands alone on the dark until the arena returns
  const backdrop = stage === 'iris' ? 'iris' : stage === 'board' && !arenaBack ? 'dark' : 'arena';
  return (
    <section
      className="me"
      data-stage={stage}
      data-backdrop={stage === 'beat' ? undefined : backdrop}
    >
      {stage === 'iris' && (
        <div
          className="me__iris"
          aria-hidden="true"
          style={
            {
              '--x': `${Math.round(at.x * 100)}%`,
              '--y': `${Math.round(at.y * 100)}%`,
              '--iris': `${T.irisMs}ms`,
            } as CSSProperties
          }
        />
      )}
      {(stage === 'board' || stage === 'out') && (
        <div className="me__board" data-leaving={stage === 'out' || undefined}>
          <Scoreboard
            hud={hud}
            winnerId={winnerId}
            showContinue={arenaBack && stage === 'board'}
            onContinue={() => setStage('out')}
          />
        </div>
      )}
      {stage === 'results' && (
        <ResultsScreen
          hud={hud}
          waiting={waiting}
          onRematch={onRematch}
          onLobby={onLobby}
          choreographed
        />
      )}
    </section>
  );
}
