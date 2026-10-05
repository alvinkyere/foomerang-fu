import { clampOrigin, joystickRadius, joystickVector, type Point } from '@foomerang/controller-sdk';
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { tick } from '../haptics';

export interface JoystickProps {
  /** The manifest's id for this control. It labels the control; the game gives it meaning. */
  readonly controlId: string;
  /** Normalized value in [-1, 1], +X right, +Y DOWN. Called as often as the pointer moves. */
  readonly onChange: (value: Point) => void;
}

const NEUTRAL: Point = { x: 0, y: 0 };

interface Gesture {
  readonly pointerId: number;
  readonly origin: Point;
  readonly radius: number;
}

const KEYS: Readonly<Record<string, 'up' | 'down' | 'left' | 'right'>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

/**
 * A floating virtual joystick over the whole control area: the base appears where the thumb lands
 * (so a player never has to look for it), and the value is how far the thumb has moved from there.
 *
 * Pointer Events (touch, mouse and pen through one model) with pointer capture, so the thumb may
 * wander off the control without losing it. Every way a gesture can end — lift, cancel, lost
 * capture, window blur, page hidden/unloading, unmount — sends NEUTRAL, so it cannot get stuck.
 * Arrow keys / WASD steer too (accessibility, and the desktop way to try it).
 */
export function Joystick({ controlId, onChange }: JoystickProps) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const keys = useRef(new Set<'up' | 'down' | 'left' | 'right'>());
  const [active, setActive] = useState(false);
  const helpId = `joystick-help-${controlId}`;

  const place = (element: HTMLElement | null, x: number, y: number): void => {
    if (element) element.style.transform = `translate(${x}px, ${y}px)`;
  };

  const endGesture = (): void => {
    const wasActive = gesture.current !== null || keys.current.size > 0;
    gesture.current = null;
    keys.current.clear();
    setActive(false);
    place(thumbRef.current, 0, 0);
    if (wasActive) onChange(NEUTRAL);
  };

  // Window-level interruptions. An Effect Event always sees the latest props without re-subscribing.
  const interrupted = useEffectEvent(() => {
    if (gesture.current !== null || keys.current.size > 0) endGesture();
  });
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
      interrupted(); // unmounting mid-gesture must not leave the character running
    };
  }, []);

  // --- pointer ------------------------------------------------------------------------------

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (gesture.current !== null) return; // one finger drives the stick
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const zone = event.currentTarget;
    const rect = zone.getBoundingClientRect();
    const radius = joystickRadius(rect.width, rect.height);
    const origin = clampOrigin(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      rect,
      radius,
    );
    gesture.current = { pointerId: event.pointerId, origin, radius };
    zone.setPointerCapture(event.pointerId);
    zone.style.setProperty('--joystick-radius', `${radius}px`);
    place(baseRef.current, origin.x, origin.y);
    place(thumbRef.current, 0, 0);
    setActive(true);
    tick();
    onChange(NEUTRAL);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const current = gesture.current;
    if (current === null || event.pointerId !== current.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const value = joystickVector(
      current.origin,
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      current.radius,
    );
    place(thumbRef.current, value.x * current.radius, value.y * current.radius);
    onChange(value);
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>): void => {
    const current = gesture.current;
    if (current !== null && event.pointerId === current.pointerId) endGesture();
  };

  // --- keyboard -----------------------------------------------------------------------------

  const emitKeys = (): void => {
    const held = keys.current;
    const x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    const y = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0);
    const length = Math.hypot(x, y);
    onChange(length === 0 ? NEUTRAL : { x: x / length + 0, y: y / length + 0 });
  };

  const keyOf = (event: KeyboardEvent): 'up' | 'down' | 'left' | 'right' | undefined =>
    KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const key = keyOf(event);
    if (key === undefined) return;
    event.preventDefault(); // arrow keys must not scroll the page
    keys.current.add(key);
    setActive(true);
    emitKeys();
  };

  const onKeyUp = (event: KeyboardEvent<HTMLDivElement>): void => {
    const key = keyOf(event);
    if (key === undefined) return;
    keys.current.delete(key);
    if (keys.current.size === 0 && gesture.current === null) setActive(false);
    emitKeys();
  };

  return (
    <div
      ref={zoneRef}
      className="joystick-zone"
      role="group"
      aria-label={`${controlId} joystick`}
      aria-describedby={helpId}
      tabIndex={0}
      data-active={active}
      // Inline as well as in CSS: scrolling or zooming must never steal the touch, even if the
      // stylesheet were slow to load.
      style={{ touchAction: 'none', userSelect: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => {
        if (keys.current.size > 0) endGesture();
      }}
    >
      <div ref={baseRef} className="joystick-base" aria-hidden="true">
        <div ref={thumbRef} className="joystick-thumb" />
      </div>
      <p id={helpId} className="visually-hidden">
        Drag anywhere on this area to move. Arrow keys or W, A, S, D also work.
      </p>
    </div>
  );
}
