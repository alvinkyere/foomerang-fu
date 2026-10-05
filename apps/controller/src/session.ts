import type { ControllerState, Point } from '@foomerang/controller-sdk';
import { useSyncExternalStore } from 'react';

/**
 * What the UI is allowed to ask of the controller session. React components depend on THIS, not on
 * sockets or on the SDK class: they say join(), setControlValue(), neutralize(); the SDK owns the
 * protocol, sequence numbers, sampling and reconnection.
 */
export interface SessionPort {
  getState(): ControllerState;
  subscribe(listener: () => void): () => void;
  join(joinCode: string, displayName: string): void;
  leave(): void;
  setControlValue(controlId: string, value: Point): void;
  neutralize(): void;
}

/** The session's consumer-facing state, as React state. */
export function useControllerState(session: SessionPort): ControllerState {
  return useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.getState(),
  );
}
