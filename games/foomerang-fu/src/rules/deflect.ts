import type { Vec2 } from '@foomerang/game-core';

/**
 * Where a slash knocks a boomerang. THE rule, in one line:
 *
 *     out = normalize( reflect(v, s) + s + rot90(s) )
 *
 *   v        unit vector of the incoming boomerang's travel
 *   s        unit vector of the defender's slash direction (locked when the swing began)
 *   reflect  v − 2 (v·s) s   — the boomerang bounces off the blade's face, which is a plane
 *                              perpendicular to the swing (so the incoming trajectory matters)
 *   + s                      — the blade's push along the swing
 *   rot90(s) = (−s.y, s.x)   — the blade is SWEEPING across its arc (towards increasing angle, the
 *                              direction the swoosh is drawn), so it also carries things sideways
 *
 * Properties, all tested: `out` is a unit vector; out·s = 1 − v·s ≥ 0, so a boomerang is never knocked
 * back through the defender; the sum can never be the zero vector (rot90(s) is perpendicular to the
 * other two terms, which can cancel only when v = s, leaving rot90(s)); and a head-on throw is NOT
 * returned straight at the thrower — it leaves about 27° off the line the throw came down. Where the
 * defender stands and which way they face therefore decide where it goes.
 *
 * This is a model, not physics: no mass, spin, restitution or collision solver.
 */
export function deflectionDirection(v: Vec2, s: Vec2): Vec2 {
  const along = v.x * s.x + v.y * s.y;
  const rx = v.x - 2 * along * s.x + s.x - s.y;
  const ry = v.y - 2 * along * s.y + s.y + s.x;
  const length = Math.hypot(rx, ry);
  return Object.freeze({ x: rx / length, y: ry / length });
}
