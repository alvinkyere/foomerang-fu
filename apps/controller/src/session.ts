import type { ControllerState, Point } from '@foomerang/controller-sdk';
import type { SystemAction } from '@foomerang/protocol';
import { useSyncExternalStore } from 'react';

/**
 * What the UI is allowed to ask of the controller session. React components depend on THIS, not on
 * sockets or on the SDK class: they say join(), setControlValue(), setButton(), neutralize(); the SDK owns the
 * protocol, sequence numbers, sampling and reconnection.
 */
export interface SessionPort {
  getState(): ControllerState;
  subscribe(listener: () => void): () => void;
  join(joinCode: string, displayName: string): void;
  leave(): void;
  setControlValue(controlId: string, value: Point): void;
  setButton(controlId: string, pressed: boolean): void;
  /** The phone's own system button (MENU: pause / resume), outside the game's controls. */
  setSystemButton(action: SystemAction, pressed: boolean): void;
  neutralize(): void;
  /** Vibrations the TV asks of this phone (the game's feedback). Returns an unsubscribe function. */
  onRumble(listener: (rumble: { intensity: number; durationMs: number }) => void): () => void;
}

/** The session's consumer-facing state, as React state. */
export function useControllerState(session: SessionPort): ControllerState {
  return useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.getState(),
  );
}
