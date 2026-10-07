/**
 * market_plaza's camera: the camera SOLVED from the master gameplay video (take A, frame 233; art/reconstruction/analysis),
 * frozen as the game camera. A pinhole over the plaza ground, rendered at 1920 × 1080 (the video's 640 × 360 scaled ×3).
 * The baked environment layers and the character atlases were rendered through exactly this camera, so a world point projected
 * here lands on the same pixel as in the baked art. Pure maths: no Phaser, so it can be tested.
 *
 * World mapping (shared with the rules data, art/reconstruction/runtime/gen_plaza_arena.py): one Blender unit = 20 world units,
 * x_bu = X / 20 − 50, y_bu = 100 − Y / 20 (world Y grows toward the viewer, the reconstruction's y away from it); heights alike.
 * The solver works in "plan units" (= 100 Blender units).
 */
export const PLAZA_CANVAS = Object.freeze({ width: 1920, height: 1080 });

const F = 900 * 3; // focal length in canvas pixels (900 px at 640 wide)
const CX = 960;
const CY = 540;
/** World → camera rotation (rows) and the camera centre in plan units, from the per-frame solve. */
const R = [
  [0.999919935, -0.010019433, 0.007728796],
  [-0.003777188, -0.819266295, -0.573400794],
  [0.012077093, 0.573325692, -0.819238546],
] as const;
const C = [-0.07996036, -0.165455956, 1.157101135] as const;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** World point (x, y) at height z (all world units) → canvas pixels. */
export function plazaProject(x: number, y: number, z = 0): Point {
  const p = [(x / 20 - 50) / 100 - C[0], (100 - y / 20) / 100 - C[1], z / 2000 - C[2]];
  const cam = R.map((row) => row[0] * (p[0] ?? 0) + row[1] * (p[1] ?? 0) + row[2] * (p[2] ?? 0));
  const depth = cam[2] ?? 1;
  return { x: (F * (cam[0] ?? 0)) / depth + CX, y: (F * (cam[1] ?? 0)) / depth + CY };
}

/** How many canvas pixels one world unit is, along the ground, at (x, y). */
export function plazaGroundScale(
  x: number,
  y: number,
): { readonly sx: number; readonly sy: number } {
  const a = plazaProject(x, y);
  const right = plazaProject(x + 1, y);
  const down = plazaProject(x, y + 1);
  return {
    sx: Math.hypot(right.x - a.x, right.y - a.y),
    sy: Math.hypot(down.x - a.x, down.y - a.y),
  };
}
