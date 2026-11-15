import { useEffect, useRef, useState } from 'react';
import { FocusScope, useFocusItem } from '../shell/focus/FocusManager';
import './controlsCard.css';

/**
 * The CONTROLS card before the first round, as ff physics hq 2.mp4 9:53 (frames 35590–35680 at 60 fps) shows it: the map
 * blurred and dimmed behind it, CONTROLS, a dark panel headed by the controller and one row per control, and CONTINUE. The
 * video's rows show a gamepad's buttons; ours show the phone's own controls exactly as the phone draws them: the stick
 * (MOVE), and the SLASH, THROW and DASH buttons in their own looks, with their own words. Any phone's
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

/**
 * A row's control drawn as the phone draws it (apps/controller/src/styles.css), its word inside: the stick's dark pad with
 * its dashed ring and MOVE, SLASH solid amber, THROW dark with an amber border, DASH dark with a dashed amber border.
 */
function Control({ id, word }: { readonly id: ControlId; readonly word: string }) {
  return <span className={`cc__button cc__button--${id}`}>{word}</span>;
}

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
              <Control id={row.id} word={row.word} />
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
