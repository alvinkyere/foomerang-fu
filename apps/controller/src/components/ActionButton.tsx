import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { tick } from '../haptics';

export interface ActionButtonProps {
  /** The manifest's id for this control. It is the label; the game gives the action its meaning. */
  readonly controlId: string;
  /** `true` when it goes down, `false` when it comes up. Called once per change, never repeated. */
  readonly onChange: (pressed: boolean) => void;
}

/**
 * A big press-and-release button. It reports exactly two things — down and up — and never
 * repeats while held, so a held thumb cannot act twice. Every way a press can end (lift, cancel,
 * lost capture, window blur, page hidden/unloading, unmount) reports UP, so it cannot get stuck.
 * Space / Enter work too (accessibility, and the desktop way to try it).
 */
export function ActionButton({ controlId, onChange }: ActionButtonProps) {
  const pointer = useRef<number | null>(null);
  const key = useRef(false);
  const [pressed, setPressed] = useState(false);

  const isHeld = (): boolean => pointer.current !== null || key.current;

  const release = (): void => {
    if (!isHeld()) return;
    pointer.current = null;
    key.current = false;
    setPressed(false);
    onChange(false);
  };

  const press = (): void => {
    setPressed(true);
    tick();
    onChange(true);
  };

  // Window-level interruptions. An Effect Event always sees the latest props without re-subscribing.
  const interrupted = useEffectEvent(() => release());
  useEffect(() => {
    const onHidden = (): void => {
      if (document.visibilityState === 'hidden') interrupted();
    };
    window.addEventListener('blur', interrupted);
    window.addEventListener('pagehide', interrupted);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('blur', interrupted);
      window.removeEventListener('pagehide', interrupted);
      document.removeEventListener('visibilitychange', onHidden);
      interrupted(); // unmounting while held must not leave it pressed
    };
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    if (isHeld()) return; // one press at a time
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    press();
  };

  const onPointerEnd = (event: PointerEvent<HTMLButtonElement>): void => {
    if (pointer.current !== null && event.pointerId === pointer.current) release();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (event.repeat || isHeld()) return; // holding a key never repeats the action
    key.current = true;
    press();
  };

  const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    if (key.current) release();
  };

  return (
    <button
      type="button"
      className="action-button"
      data-pressed={pressed}
      // Inline as well as in CSS: scrolling, zooming or a long-press must never steal the touch.
      style={{ touchAction: 'none', userSelect: 'none' }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onContextMenu={(event) => event.preventDefault()}
    >
      {controlId}
    </button>
  );
}
