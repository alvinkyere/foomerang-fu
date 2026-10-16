import type { ScoreEventView } from '../render/viewModel';

/** The score toasts on screen, and the serial that keys the next one. */
export interface ScoreToastState {
  readonly toasts: readonly ScoreEventView[];
  readonly serial: number;
}

const SHOWN = 4;

/**
 * Adds a frame's score events to the toasts on screen (the newest four). Each toast is re-keyed by a serial that only grows for
 * the life of the arena screen: the view model keys an event by (elapsed time, index), and a rematch on the same map can replay
 * the same kill at the same moment while the previous match's toast is still showing.
 */
export function addScoreToasts(
  state: ScoreToastState,
  fresh: readonly ScoreEventView[],
): ScoreToastState & { readonly added: readonly ScoreEventView[] } {
  let serial = state.serial;
  const added = fresh.map((e) => ({ ...e, key: `toast-${(serial += 1)}` }));
  return { toasts: [...state.toasts, ...added].slice(-SHOWN), serial, added };
}
