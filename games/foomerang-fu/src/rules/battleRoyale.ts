import type { Rect } from './arena';
import type { FuState } from './state';

/**
 * BATTLE_ROYALE, as the reference video shows it (art/physics_reference/README.md, "Battle Royale"). Taking it is not owning
 * it: after a hold (`BATTLE_ROYALE_HOLD`) the arena's border (its safe zone) closes in on its middle, every side at
 * `BATTLE_ROYALE_SHRINK` world units a second (4:37.7–4:46.0: ≈ 0.6 plank-widths a second across, the plank ≈ 5.3 character widths, ours drawn ≈ 76 u wide:
 * ≈ 121 u a side, ±40%). Whoever the border passes is outside, and the arena's out-of-bounds rule takes them (4:46.4). It closes
 * once a round (a second one changes nothing) and stops at the middle; a new round starts with the full arena.
 */
export const BATTLE_ROYALE_SHRINK = 121;

/** Seconds the border holds where it is after the take, glowing, before it starts to close (4:37.03 the take; the dashed line
 * appears and moves from 4:37.94). */
export const BATTLE_ROYALE_HOLD = 0.9;

/** The safe zone as it is now: the arena's own, or (Battle Royale) closed in by the time since it was taken. */
export function zoneAt(
  base: Rect | undefined,
  since: number | undefined,
  t: number,
): Rect | undefined {
  if (base === undefined || since === undefined) return base;
  const d = Math.max(0, BATTLE_ROYALE_SHRINK * (t - since - BATTLE_ROYALE_HOLD));
  const dx = Math.min(d, base.width / 2);
  const dy = Math.min(d, base.height / 2);
  return {
    x: base.x + dx,
    y: base.y + dy,
    width: base.width - 2 * dx,
    height: base.height - 2 * dy,
  };
}

/** The safe zone of `state` now (undefined: the arena has no border). */
export const zoneOf = (state: FuState): Rect | undefined =>
  zoneAt(state.config.arena.safeZone, state.closingSince, state.roundTime);
