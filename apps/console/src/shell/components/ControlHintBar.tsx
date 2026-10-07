import { useInputDevice } from '../focus/FocusManager';

export type HintStyle = 'auto' | 'keyboard' | 'gamepad';
export interface Hint {
  readonly action: 'move' | 'move-v' | 'select' | 'back';
  readonly label: string;
}

const KEYBOARD = { move: '← →', 'move-v': '↑ ↓', select: 'Enter', back: 'Esc' } as const;

function Glyph({
  action,
  gamepad,
}: {
  readonly action: Hint['action'];
  readonly gamepad: boolean;
}) {
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
  return (
    <ul className="hintbar" aria-label="Controls">
      {hints.map((hint) => (
        <li key={hint.action + hint.label} className="hintbar__item">
          <Glyph action={hint.action} gamepad={gamepad} />
          <span>{hint.label}</span>
        </li>
      ))}
    </ul>
  );
}
