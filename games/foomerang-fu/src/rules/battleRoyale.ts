import { breakablesOf, distanceToSolid, wallsOf, type FuArena, type Rect } from './arena';
import type { FuState } from './state';

/**
 * BATTLE_ROYALE, as the reference video shows it (art/physics_reference/README.md, "Battle Royale"). Taking it is not owning
 * it: after a hold (`BATTLE_ROYALE_HOLD`) the arena's border (its safe zone) closes in on its middle, every side at
 * `BATTLE_ROYALE_SHRINK` world units a second (4:37.7–4:46.0: ≈ 0.6 plank-widths a second across, the plank ≈ 5.3 character widths, ours drawn ≈ 76 u wide:
 * ≈ 121 u a side, ±40%). Whoever the border passes is outside, and the arena's out-of-bounds rule takes them (4:46.4). It closes
 * once a round (a second one changes nothing) and stops at a box people can move in (`finalBox`); a new round starts with
 * the full arena.
 */
export const BATTLE_ROYALE_SHRINK = 121;

/** Seconds the border holds where it is after the take, glowing, before it starts to close (4:37.03 the take; the dashed line
 * appears and moves from 4:37.94). */
export const BATTLE_ROYALE_HOLD = 0.9;

/**
 * Where it stops (the owner, 2026-10-21; the video's rounds end before it does): a square box BATTLE_ROYALE_FINAL across, 6
 * character widths, room to move. It is centred on ground people can stand on: the nearest to the border's middle of the boxes
 * that are at least 80% floor a body can stand on (no walls, props or crates within its radius) with a body fitting at the centre.
 */
export const BATTLE_ROYALE_FINAL = 456;

const BODY = 36;
/** A box is good enough when this much of it is floor a body can stand on. */
const ENOUGH_FLOOR = 0.8;
const boxes = new WeakMap<FuArena, Rect>();

/** The box the border closes to in `arena` (deterministic: a pure function of the arena, worked out once). */
export function finalBox(arena: FuArena): Rect {
  const known = boxes.get(arena);
  if (known !== undefined) return known;
  const zone = arena.safeZone ?? { x: 0, y: 0, width: arena.width, height: arena.height };
  const solids = [...wallsOf(arena), ...breakablesOf(arena)];
  const half = Math.min(BATTLE_ROYALE_FINAL, zone.width, zone.height) / 2;
  const mid = { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
  const free = (x: number, y: number) => solids.every((w) => distanceToSolid({ x, y }, w) > BODY);
  const STEP = 24;
  let cells = 0;
  for (let x = -half + BODY / 2; x < half; x += BODY)
    for (let y = -half + BODY / 2; y < half; y += BODY) cells += 1;
  let best = { good: false, fraction: -1, d: Infinity, x: mid.x, y: mid.y };
  // candidates on a grid laid out from the middle, inside the border
  const xs: number[] = [];
  const ys: number[] = [];
  for (let k = -200; k <= 200; k += 1) {
    const x = mid.x + k * STEP;
    const y = mid.y + k * STEP;
    if (x >= zone.x + half - 1e-9 && x <= zone.x + zone.width - half + 1e-9) xs.push(x);
    if (y >= zone.y + half - 1e-9 && y <= zone.y + zone.height - half + 1e-9) ys.push(y);
  }
  for (const cx of xs)
    for (const cy of ys) {
      if (!free(cx, cy)) continue; // a body must fit at its centre
      let n = 0;
      for (let x = cx - half + BODY / 2; x < cx + half; x += BODY)
        for (let y = cy - half + BODY / 2; y < cy + half; y += BODY) if (free(x, y)) n += 1;
      const d = Math.hypot(cx - mid.x, cy - mid.y);
      // the nearest to the middle of the boxes that are mostly floor; failing any, the one with the most floor
      const fraction = n / cells;
      const good = fraction >= ENOUGH_FLOOR;
      const better = good
        ? !best.good || d < best.d
        : !best.good && (fraction > best.fraction || (fraction === best.fraction && d < best.d));
      if (better) best = { good, fraction, d, x: cx, y: cy };
    }
  const box = Object.freeze({
    x: best.x - half,
    y: best.y - half,
    width: 2 * half,
    height: 2 * half,
  });
  boxes.set(arena, box);
  return box;
}

/** The safe zone as it is now: the arena's own, or (Battle Royale) each side closed in towards the final box. */
export function zoneAt(arena: FuArena, since: number | undefined, t: number): Rect | undefined {
  const base = arena.safeZone;
  if (base === undefined || since === undefined) return base;
  const d = Math.max(0, BATTLE_ROYALE_SHRINK * (t - since - BATTLE_ROYALE_HOLD));
  const end = finalBox(arena);
  const left = Math.min(base.x + d, end.x);
  const top = Math.min(base.y + d, end.y);
  const right = Math.max(base.x + base.width - d, end.x + end.width);
  const bottom = Math.max(base.y + base.height - d, end.y + end.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The safe zone of `state` now (undefined: the arena has no border). */
export const zoneOf = (state: FuState): Rect | undefined =>
  zoneAt(state.config.arena, state.closingSince, state.roundTime);
