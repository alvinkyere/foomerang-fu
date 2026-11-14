import { useEffect, useRef, useState } from 'react';
import { FocusScope, useFocusItem } from '../shell/focus/FocusManager';
import './controlsCard.css';

/**
 * The CONTROLS card before the first round, as ff physics hq 2.mp4 9:53 (frames 35590–35680 at 60 fps) shows it: the map
 * blurred and dimmed behind it, CONTROLS, a dark panel headed by the controller and one row per control, and CONTINUE. The
 * video's rows name a gamepad's buttons; ours name the phone's: the stick, and SLASH (the big top button), THROW (bottom
 * left) and DASH (bottom right), each drawn where it sits on the phone, in the video's colour for that action. Any phone's
 * SELECT (or the TV) presses CONTINUE; the match waits, still, until then (MatchDirector.dismissControls).
 */
export const CONTROL_ROWS = [
  { id: 'move', word: 'MOVE' },
  { id: 'dash', word: 'DASH' },
  { id: 'slash', word: 'SLASH' },
  { id: 'throw', word: 'THROW' },
] as const;

type ControlId = (typeof CONTROL_ROWS)[number]['id'];

/** Measured: the button lights for a frame, then everything fades out over 9 frames (150 ms) before the round begins. */
export const CONTROLS_OUT_MS = 170;

/** The phone, landscape: the stick at left, the three buttons at right (SLASH across the top, THROW and DASH below). */
function PhoneIcon() {
  return (
    <svg className="cc__phone" viewBox="0 0 64 36" aria-hidden="true">
      <rect
        x="1.5"
        y="1.5"
        width="61"
        height="33"
        rx="7"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <circle cx="17" cy="18" r="7.5" fill="currentColor" />
      <rect x="31" y="7" width="24" height="10" rx="3" fill="currentColor" />
      <rect x="31" y="20" width="11" height="9" rx="3" fill="currentColor" />
      <rect x="44" y="20" width="11" height="9" rx="3" fill="currentColor" />
    </svg>
  );
}

/** A row's round button: the stick, or the phone's three buttons with this one filled. */
function Glyph({ id }: { readonly id: ControlId }) {
  return (
    <span className={`cc__glyph cc__glyph--${id}`} aria-hidden="true">
      <svg viewBox="0 0 20 20">
        {id === 'move' ? (
          <>
            <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="10" cy="10" r="2.6" fill="currentColor" />
          </>
        ) : (
          <>
            <rect x="3.5" y="4" width="13" height="5.5" rx="1.6" {...cell(id === 'slash')} />
            <rect x="3.5" y="11" width="6" height="5" rx="1.6" {...cell(id === 'throw')} />
            <rect x="10.5" y="11" width="6" height="5" rx="1.6" {...cell(id === 'dash')} />
          </>
        )}
      </svg>
    </span>
  );
}
const cell = (on: boolean) =>
  on
    ? { fill: 'currentColor' }
    : { fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, opacity: 0.55 };

export function ControlsCard({ onContinue }: { readonly onContinue: () => void }) {
  return (
    <FocusScope id="controls" initialFocus="controls-continue" remember={false}>
      <Card onContinue={onContinue} />
    </FocusScope>
  );
}

function Card({ onContinue }: { readonly onContinue: () => void }) {
  const proceed = useFocusItem<HTMLButtonElement>('controls-continue');
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <div className="cc" data-leaving={leaving || undefined} data-testid="controls-card">
      <h1 className="cc__title">CONTROLS</h1>
      <div className="cc__panel">
        <div className="cc__head">
          <PhoneIcon />
        </div>
        <ul className="cc__rows" aria-label="Controls">
          {CONTROL_ROWS.map((row) => (
            <li key={row.id} className="cc__row">
              <Glyph id={row.id} />
              {row.word}
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        {...proceed}
        className="cc__continue"
        onClick={() => {
          if (leaving) return;
          setLeaving(true);
          timer.current = window.setTimeout(onContinue, CONTROLS_OUT_MS);
        }}
      >
        CONTINUE
      </button>
    </div>
  );
}
