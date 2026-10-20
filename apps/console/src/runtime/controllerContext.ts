import type { ControllerContext } from '@foomerang/protocol';
import type { MatchPhase } from './matchRuntime';

export interface ContextInputs {
  /** The room's state as the server last said it. */
  readonly roomState: string | undefined;
  /** Somebody opened the pause menu. */
  readonly manualPaused: boolean;
  readonly matchPhase: MatchPhase | undefined;
}

/**
 * What the phones' controls mean, decided by the host from what is really happening (never from
 * which screen is up, and never by the phones). Anything but a running match is the console.
 */
export function deriveContext(inputs: ContextInputs): ControllerContext {
  if (inputs.roomState !== 'PLAYING') return 'CONSOLE';
  if (inputs.manualPaused) return 'PAUSED';
  // the scoreboard between rounds and the results: the phones press CONTINUE / REMATCH with SELECT
  if (inputs.matchPhase === 'MATCH_OVER' || inputs.matchPhase === 'SCOREBOARD') return 'RESULTS';
  return 'GAMEPLAY';
}
