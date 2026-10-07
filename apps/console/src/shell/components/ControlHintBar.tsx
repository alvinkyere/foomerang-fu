import { useInputDevice } from '../focus/FocusManager';

export type HintStyle = 'auto' | 'keyboard' | 'gamepad';
export interface Hint {
  readonly action: 'move' | 'move-v' | 'select' | 'back';
  readonly label: string;
}

const KEYBOARD = { move: '← →', 'move-v': '↑ ↓', select: 'Enter', back: 'Esc' } as const;
/** A phone's controls are named on its own screen (NAVIGATE / SELECT / BACK): the hints use the same words. */
const PHONE = { move: 'Stick', 'move-v': 'Stick', select: 'SELECT', back: 'BACK' } as const;

function Glyph({
  action,
  gamepad,
  phone,
}: {
  readonly action: Hint['action'];
  readonly gamepad: boolean;
  readonly phone: boolean;
}) {
  if (phone) return <kbd className="glyph glyph--key glyph--phone">{PHONE[action]}</kbd>;
  if (!gamepad) return <kbd className="glyph glyph--key">{KEYBOARD[action]}</kbd>;
  if (action === 'select') return <kbd className="glyph glyph--btn glyph--a">A</kbd>;
  if (action === 'back') return <kbd className="glyph glyph--btn glyph--b">B</kbd>;
  return (
    <kbd className="glyph glyph--dpad" aria-label="D-pad">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M12 3h8v9h9v8h-9v9h-8v-9H3v-8h9Z" />
      </svg>
    </kbd>
  );
}

/** What the buttons do right now, in the glyphs of the device the player is actually holding. */
export function ControlHintBar({
  hints,
  style = 'auto',
}: {
  readonly hints: readonly Hint[];
  readonly style?: HintStyle;
}) {
  const device = useInputDevice();
  const gamepad = style === 'gamepad' || (style === 'auto' && device === 'gamepad');
  const phone = style === 'auto' && device === 'phone';
  return (
    <ul className="hintbar" aria-label="Controls">
      {hints.map((hint) => (
        <li key={hint.action + hint.label} className="hintbar__item">
          <Glyph action={hint.action} gamepad={gamepad} phone={phone} />
          <span>{hint.label}</span>
        </li>
      ))}
    </ul>
  );
}
