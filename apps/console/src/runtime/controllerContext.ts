import type { ControllerContext } from '@foomerang/protocol';

export interface ContextInputs {
  /** The room's state as the server last said it. */
  readonly roomState: string | undefined;
  /** Somebody opened the pause menu. */
  readonly manualPaused: boolean;
  readonly matchPhase: 'PLAYING' | 'ROUND_OVER' | 'MATCH_OVER' | undefined;
}

/**
 * What the phones' controls mean, decided by the host from what is really happening (never from
 * which screen is up, and never by the phones). Anything but a running match is the console.
 */
export function deriveContext(inputs: ContextInputs): ControllerContext {
  if (inputs.roomState !== 'PLAYING') return 'CONSOLE';
  if (inputs.manualPaused) return 'PAUSED';
  if (inputs.matchPhase === 'MATCH_OVER') return 'RESULTS';
  return 'GAMEPLAY';
}
