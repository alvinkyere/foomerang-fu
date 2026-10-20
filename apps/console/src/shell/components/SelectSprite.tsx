import { useEffect, useRef, useState } from 'react';
import {
  BLINK_CHANCE,
  SELECT_SHEET,
  cellOf,
  frameAt,
  type ArrivalSide,
} from '../../characters/selectAnimation';

export interface SelectSpriteProps {
  /** The character's animation sheet (frames in SELECT_SHEET's grid). */
  readonly sheet: string;
  /** Its first idle frame alone: shown until the sheet has loaded, and instead of the animation for reduced motion. */
  readonly still: string;
  /** The way the cursor moved onto this character (it turns in from that side), if it did. */
  readonly arrival?: ArrivalSide | undefined;
  /** Its player is READY: it cheers when this turns on (not when it appears already ready), then idles again. */
  readonly ready?: boolean;
}

/** Reduced motion: the shell's own setting (data-reduced-motion on the root) or, when it follows the system, the system's. */
const reducedMotion = (): boolean => {
  const own = document.documentElement.dataset['reducedMotion'];
  if (own !== undefined) return own === 'true';
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
};

const ROWS = Math.ceil(SELECT_SHEET.frames / SELECT_SHEET.cols);
const pct = (i: number, n: number): string => `${Number(((i / (n - 1)) * 100).toFixed(4))}%`;
const backgroundPosition = (frame: number): string => {
  const { col, row } = cellOf(frame);
  return `${pct(col, SELECT_SHEET.cols)} ${pct(row, ROWS)}`;
};

/**
 * A character in its character-select circle, moving as in game-setting.mp4: the arrival, then the idle loop with its blinks,
 * and the cheer when its player readies, drawn from one pre-rendered sheet at 30 fps. The frame is written straight to the element each animation frame (no React render per frame:
 * cheap on a TV). Remount it (a new `key`) when the character changes, so it arrives again.
 */
export function SelectSprite({ sheet, still, arrival, ready = false }: SelectSpriteProps) {
  const [loaded, setLoaded] = useState(false);
  const [motionless] = useState(reducedMotion);
  const el = useRef<HTMLSpanElement>(null);
  const born = useRef<number | undefined>(undefined);
  const cheerFrom = useRef<number | undefined>(undefined);
  const wasReady = useRef(ready);
  const chances = useRef(new Map<string, boolean>());

  useEffect(() => {
    if (motionless) return;
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (live) setLoaded(true);
    };
    img.src = sheet;
    return () => {
      live = false;
    };
  }, [sheet, motionless]);

  // readying (not appearing ready) starts the cheer; un-readying goes straight back to the idle loop
  useEffect(() => {
    if (ready && !wasReady.current && born.current !== undefined)
      cheerFrom.current = performance.now() - born.current;
    if (!ready) cheerFrom.current = undefined;
    wasReady.current = ready;
  }, [ready]);

  useEffect(() => {
    if (!loaded) return;
    born.current = performance.now();
    const blink = (chance: string): boolean => {
      let yes = chances.current.get(chance);
      if (yes === undefined) {
        yes = Math.random() < BLINK_CHANCE;
        chances.current.set(chance, yes);
      }
      return yes;
    };
    let id = 0;
    const tick = () => {
      const ms = performance.now() - (born.current ?? 0);
      if (el.current !== null)
        el.current.style.backgroundPosition = backgroundPosition(
          frameAt(ms, { arrival, cheerFrom: cheerFrom.current, blink }),
        );
      id = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(id);
  }, [loaded, arrival]);

  if (!loaded) return <img className="cs__portrait" src={still} alt="" draggable={false} />;
  return (
    <span
      ref={el}
      className="cs__portrait cs__sprite"
      style={{
        backgroundImage: `url("${sheet}")`,
        backgroundSize: `${SELECT_SHEET.cols * 100}% ${ROWS * 100}%`,
        backgroundPosition: backgroundPosition(
          arrival === undefined ? 0 : frameAt(0, { arrival, blink: () => false }),
        ),
      }}
      aria-hidden="true"
    />
  );
}
