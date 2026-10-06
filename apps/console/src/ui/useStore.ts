import { useSyncExternalStore } from 'react';
import type { HostSession, HostState } from '../host';

/** The session is the single source of truth; React only reads it. */
export function useHostState(session: HostSession): HostState {
  return useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.getState(),
  );
}
