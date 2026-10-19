import type { Vec2 } from '@foomerang/game-core';
import type { GateSpec, HazardSpec, PlatformSpec } from './systems';

/**
 * Arena geometry is DATA owned by the rules. Walls are axis-aligned rectangles (x, y = top-left
 * corner; +X right, +Y down, like everything in Fu). The renderer draws them; it never decides what
 * they block. An arena with no walls and no spawns is the Slice 1 arena, exactly.
 */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A round wall: a pot, a post, the fountain. */
export interface Disc {
  readonly shape: 'disc';
  /** Its centre. */
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** A box turned the way its model stands: a crate, a stall. `angle` in radians (clockwise on screen: +Y is down). */
export interface TurnedBox {
  readonly shape: 'box';
  /** Its centre. */
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly angle: number;
}

/** Anything solid: an axis-aligned rectangle (most walls), a disc or a turned box. */
export type Solid = Rect | Disc | TurnedBox;

/** `W`: the kinds of wall it has (an arena of plain rectangles says so: `FuArena<Rect>`). */
export interface FuArena<W extends Solid = Solid> {
  readonly width: number;
  readonly height: number;
  /** Solid cover. Blocks living players, thrown boomerangs and a slash's line of sight. */
  readonly walls?: readonly W[];
  /** Exactly one point per slot (6). Absent: the Slice 1 ellipse. */
  readonly spawns?: readonly Vec2[];
  /** Slice 6: timed gates (solid while CLOSED). */
  readonly gates?: readonly GateSpec[];
  /** Slice 6: one-dimensional moving platforms (rideable floor that carries). */
  readonly platforms?: readonly PlatformSpec[];
  /** Slice 6: periodically lethal floor zones. */
  readonly hazards?: readonly HazardSpec[];
  /**
   * The border (the plaza's dashed lines): players may leave this rectangle, but one whose centre stays outside it for
   * `outsideLimitSeconds` explodes. Absent: no border.
   */
  readonly safeZone?: Rect;
}

const NO_WALLS: readonly never[] = Object.freeze([]);
export const wallsOf = <W extends Solid>(arena: FuArena<W>): readonly W[] =>
  arena.walls ?? NO_WALLS;

// ---------------------------------------------------------------------------------------------
// Geometry. All of it is pure and symmetric in nothing but the data it is handed.
// ---------------------------------------------------------------------------------------------

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/** Distance from `p` to the nearest point of the (closed) rectangle; 0 inside it. */
export function distanceToRect(p: Vec2, rect: Rect): number {
  const cx = clamp(p.x, rect.x, rect.x + rect.width);
  const cy = clamp(p.y, rect.y, rect.y + rect.height);
  return Math.hypot(p.x - cx, p.y - cy);
}

// A turned box is an axis-aligned rectangle in its own frame: points go in, answers come back out.
const toLocal = (p: Vec2, b: TurnedBox): Vec2 => {
  const dx = p.x - b.x;
  const dy = p.y - b.y;
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
};
const toWorld = (p: Vec2, b: TurnedBox): Vec2 => {
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  return { x: b.x + p.x * c - p.y * s, y: b.y + p.x * s + p.y * c };
};
const localRect = (b: TurnedBox): Rect => ({
  x: -b.halfWidth,
  y: -b.halfHeight,
  width: 2 * b.halfWidth,
  height: 2 * b.halfHeight,
});

/** The point of `solid` nearest to `p` (`p` itself when it is inside). */
export function closestPointOn(p: Vec2, solid: Solid): Vec2 {
  if (!('shape' in solid))
    return {
      x: clamp(p.x, solid.x, solid.x + solid.width),
      y: clamp(p.y, solid.y, solid.y + solid.height),
    };
  if (solid.shape === 'disc') {
    const dx = p.x - solid.x;
    const dy = p.y - solid.y;
    const d = Math.hypot(dx, dy);
    if (d <= solid.radius) return p;
    return { x: solid.x + (dx / d) * solid.radius, y: solid.y + (dy / d) * solid.radius };
  }
  const q = toLocal(p, solid);
  return toWorld(
    {
      x: clamp(q.x, -solid.halfWidth, solid.halfWidth),
      y: clamp(q.y, -solid.halfHeight, solid.halfHeight),
    },
    solid,
  );
}

/** Distance from `p` to the nearest point of `solid`; 0 inside it. */
export function distanceToSolid(p: Vec2, solid: Solid): number {
  if (!('shape' in solid)) return distanceToRect(p, solid);
  if (solid.shape === 'disc')
    return Math.max(0, Math.hypot(p.x - solid.x, p.y - solid.y) - solid.radius);
  return distanceToRect(toLocal(p, solid), localRect(solid));
}

/** The axis-aligned box around a solid. */
export function boundsOf(solid: Solid): Rect {
  if (!('shape' in solid)) return solid;
  if (solid.shape === 'disc')
    return {
      x: solid.x - solid.radius,
      y: solid.y - solid.radius,
      width: 2 * solid.radius,
      height: 2 * solid.radius,
    };
  const c = Math.abs(Math.cos(solid.angle));
  const s = Math.abs(Math.sin(solid.angle));
  const hw = solid.halfWidth * c + solid.halfHeight * s;
  const hh = solid.halfWidth * s + solid.halfHeight * c;
  return { x: solid.x - hw, y: solid.y - hh, width: 2 * hw, height: 2 * hh };
}

/** A circle overlaps a wall only if it is STRICTLY inside its radius: touching is free, like every contact in Fu. */
export const circleHitsWalls = (p: Vec2, radius: number, walls: readonly Solid[]): boolean =>
  walls.some((wall) => distanceToSolid(p, wall) < radius);

/**
 * Where a circle centred at (x, y) must be moved so it no longer overlaps `rect`, or undefined if
 * it does not. Outside the rectangle it is pushed straight away from the nearest point; with its
 * centre inside (or on the edge) it leaves by the nearest face (ties: left, right, top, bottom).
 */
export function pushOutOfRect(
  x: number,
  y: number,
  radius: number,
  rect: Rect,
  tolerance: number,
): [number, number] | undefined {
  const nx = clamp(x, rect.x, rect.x + rect.width);
  const ny = clamp(y, rect.y, rect.y + rect.height);
  const dx = x - nx;
  const dy = y - ny;
  const distance = Math.hypot(dx, dy);
  if (distance >= radius - tolerance) return undefined;
  if (distance > 0) return [nx + (dx / distance) * radius, ny + (dy / distance) * radius];
  const left = x - rect.x;
  const right = rect.x + rect.width - x;
  const top = y - rect.y;
  const bottom = rect.y + rect.height - y;
  const nearest = Math.min(left, right, top, bottom);
  if (nearest === left) return [rect.x - radius, y];
  if (nearest === right) return [rect.x + rect.width + radius, y];
  if (nearest === top) return [x, rect.y - radius];
  return [x, rect.y + rect.height + radius];
}

/** `pushOutOfRect` for any solid: a disc pushes radially (from its very centre: to the left), a turned box in its own frame. */
export function pushOutOfSolid(
  x: number,
  y: number,
  radius: number,
  solid: Solid,
  tolerance: number,
): [number, number] | undefined {
  if (!('shape' in solid)) return pushOutOfRect(x, y, radius, solid, tolerance);
  if (solid.shape === 'disc') {
    const dx = x - solid.x;
    const dy = y - solid.y;
    const d = Math.hypot(dx, dy);
    const reach = solid.radius + radius;
    if (d >= reach - tolerance) return undefined;
    if (d === 0) return [solid.x - reach, solid.y];
    return [solid.x + (dx / d) * reach, solid.y + (dy / d) * reach];
  }
  const q = toLocal({ x, y }, solid);
  const out = pushOutOfRect(q.x, q.y, radius, localRect(solid), tolerance);
  if (out === undefined) return undefined;
  const w = toWorld({ x: out[0], y: out[1] }, solid);
  return [w.x, w.y];
}

const SWEEP_ITERATIONS = 32;

/**
 * Moves a circle from `from` towards `to` and stops it just short of the first wall it would touch.
 * Pure bisection on "does the circle overlap a wall here", so it cannot tunnel through anything the
 * end point is clear of... except a wall thinner than the whole step, which is why the end point is
 * not trusted alone: the step is cut into pieces no longer than the circle's radius first.
 * `from` is assumed clear (a start that is already blocked simply stays put).
 */
export function sweepCircle(
  from: Vec2,
  to: Vec2,
  radius: number,
  walls: readonly Solid[],
): { readonly position: Vec2; readonly blocked: boolean } {
  if (walls.length === 0) return { position: to, blocked: false };
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const pieces = Math.max(1, Math.ceil(length / Math.max(radius, 1e-9)));
  const at = (t: number): Vec2 => ({
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  });
  let clear = 0;
  for (let i = 1; i <= pieces; i += 1) {
    const t = i / pieces;
    if (circleHitsWalls(at(t), radius, walls)) {
      let lo = clear;
      let hi = t;
      for (let k = 0; k < SWEEP_ITERATIONS; k += 1) {
        const mid = (lo + hi) / 2;
        if (circleHitsWalls(at(mid), radius, walls)) hi = mid;
        else lo = mid;
      }
      return { position: at(lo), blocked: true };
    }
    clear = t;
  }
  return { position: to, blocked: false };
}

/** Does the segment a→b touch the (closed) rectangle? Slab test; used for line of sight. */
export function segmentHitsRect(a: Vec2, b: Vec2, rect: Rect): boolean {
  let tMin = 0;
  let tMax = 1;
  for (const [origin, delta, lo, hi] of [
    [a.x, b.x - a.x, rect.x, rect.x + rect.width],
    [a.y, b.y - a.y, rect.y, rect.y + rect.height],
  ] as const) {
    if (delta === 0) {
      if (origin < lo || origin > hi) return false;
    } else {
      let t1 = (lo - origin) / delta;
      let t2 = (hi - origin) / delta;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return false;
    }
  }
  return true;
}

/** Does the segment a→b touch `solid`? */
export function segmentHitsSolid(a: Vec2, b: Vec2, solid: Solid): boolean {
  if (!('shape' in solid)) return segmentHitsRect(a, b, solid);
  if (solid.shape === 'disc') {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : clamp(((solid.x - a.x) * dx + (solid.y - a.y) * dy) / l2, 0, 1);
    return Math.hypot(a.x + dx * t - solid.x, a.y + dy * t - solid.y) <= solid.radius;
  }
  return segmentHitsRect(toLocal(a, solid), toLocal(b, solid), localRect(solid));
}

/**
 * Line of sight to a VICTIM: like `lineIsClear`, except that a wall the victim's own body overlaps
 * (a player part-way through a Phase Dash) is not cover for them. A player is never immune merely
 * because they are inside a wall; a player who is not in one is sheltered by it as ever.
 */
export const lineClearTo = (
  from: Vec2,
  victim: Vec2,
  radius: number,
  walls: readonly Solid[],
): boolean =>
  !walls.some(
    (wall) => distanceToSolid(victim, wall) >= radius && segmentHitsSolid(from, victim, wall),
  );

export const lineIsClear = (a: Vec2, b: Vec2, walls: readonly Solid[]): boolean =>
  !walls.some((wall) => segmentHitsSolid(a, b, wall));

// ---------------------------------------------------------------------------------------------
// Validation: an invalid arena is a programming error (RangeError), never a game state.
// ---------------------------------------------------------------------------------------------

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Walls must be at least one player radius thick in both directions: thin enough and a body that is
 * shoved by contact could end up on the wrong side of one. `playerRadius` comes from the config.
 */
export function assertValidWalls(arena: FuArena, playerRadius: number): void {
  const walls: unknown = arena.walls;
  if (walls === undefined) return;
  if (!Array.isArray(walls)) throw new RangeError('arena.walls must be a list of solids');
  walls.forEach((wall: unknown, index) => {
    if (typeof wall !== 'object' || wall === null)
      throw new RangeError(`wall ${index} is not a solid`);
    const w = wall as Record<string, unknown>;
    const shape = w['shape'];
    const fields =
      shape === undefined
        ? ['x', 'y', 'width', 'height']
        : shape === 'disc'
          ? ['x', 'y', 'radius']
          : shape === 'box'
            ? ['x', 'y', 'halfWidth', 'halfHeight', 'angle']
            : undefined;
    if (fields === undefined) throw new RangeError(`wall ${index} has an unknown shape`);
    if (fields.some((f) => !finite(w[f])))
      throw new RangeError(`wall ${index} has a non-finite number`);
    const solid = wall as Solid;
    const thickness = !('shape' in solid)
      ? Math.min(solid.width, solid.height)
      : solid.shape === 'disc'
        ? 2 * solid.radius
        : 2 * Math.min(solid.halfWidth, solid.halfHeight);
    if (thickness < playerRadius) {
      throw new RangeError(`wall ${index} is thinner than a player radius (${playerRadius})`);
    }
    // a rectangle lies wholly inside the arena; a disc or a turned box (a model standing at the edge) needs only its centre in it
    const inside = !('shape' in solid)
      ? solid.x >= 0 &&
        solid.y >= 0 &&
        solid.x + solid.width <= arena.width &&
        solid.y + solid.height <= arena.height
      : solid.x >= 0 && solid.y >= 0 && solid.x <= arena.width && solid.y <= arena.height;
    if (!inside) throw new RangeError(`wall ${index} is not inside the arena`);
  });
}

/** Spawn points: six, inside the arena, clear of every wall and at least a body apart. */
export function assertValidSpawns(
  arena: FuArena,
  spawns: readonly Vec2[],
  playerRadius: number,
  slots: number,
): void {
  if (spawns.length !== slots) throw new RangeError(`an arena needs exactly ${slots} spawn points`);
  const walls = wallsOf(arena);
  spawns.forEach((p, index) => {
    if (!finite(p?.x) || !finite(p?.y)) throw new RangeError(`spawn ${index} is not a point`);
    if (
      p.x < playerRadius ||
      p.x > arena.width - playerRadius ||
      p.y < playerRadius ||
      p.y > arena.height - playerRadius
    ) {
      throw new RangeError(`spawn ${index} is not inside the arena`);
    }
    if (circleHitsWalls(p, playerRadius, walls)) {
      throw new RangeError(`spawn ${index} overlaps a wall`);
    }
    for (let other = index + 1; other < spawns.length; other += 1) {
      const q = spawns[other] as Vec2;
      if (Math.hypot(p.x - q.x, p.y - q.y) < playerRadius * 2) {
        throw new RangeError('the spawn points would overlap: players must start apart');
      }
    }
  });
}

// ---------------------------------------------------------------------------------------------
// The one primitive test arena.
// ---------------------------------------------------------------------------------------------

const wall = (x: number, y: number, width: number, height: number): Rect =>
  Object.freeze({ x, y, width, height });
const at = (x: number, y: number): Vec2 => Object.freeze({ x, y });

/**
 * 1600 × 900, mirrored left–right and top–bottom so no seat is better than another:
 *
 *   - a central block with a way round on every side;
 *   - four gate walls leaving a 120-wide chokepoint (one body, not two) in the top and bottom lanes;
 *   - two corridors 100 wide and 300 long (one body wide) down the flanks, open at both ends;
 *   - four free-standing cover blocks between the corridors and the middle;
 *   - open ground in the corners, along the edges and across the middle;
 *   - six spawns: top-left and bottom-right first (two players start opposite), then the other
 *     corners, then the two lane ends.
 */
export const PRIMITIVE_ARENA: FuArena<Rect> = Object.freeze({
  width: 1600,
  height: 900,
  walls: Object.freeze([
    wall(700, 390, 200, 120), // the central block
    wall(480, 150, 260, 50), // top gate, left and right of a 120 gap (x 740–860)
    wall(860, 150, 260, 50),
    wall(480, 700, 260, 50), // bottom gate
    wall(860, 700, 260, 50),
    wall(200, 300, 50, 300), // left corridor, 100 wide (x 250–350)
    wall(350, 300, 50, 300),
    wall(1200, 300, 50, 300), // right corridor (x 1250–1350)
    wall(1350, 300, 50, 300),
    wall(520, 310, 80, 80), // cover between the corridors and the middle
    wall(520, 510, 80, 80),
    wall(1000, 310, 80, 80),
    wall(1000, 510, 80, 80),
  ]),
  spawns: Object.freeze([
    at(110, 110),
    at(1490, 790),
    at(1490, 110),
    at(110, 790),
    at(800, 75),
    at(800, 825),
  ]),
});

/** The unit vector pointing away from the wall nearest to `p`, or undefined if `p` is on a wall's surface or there are none. */
export function nearestWallNormal(p: Vec2, walls: readonly Solid[]): Vec2 | undefined {
  let best: Solid | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const wall of walls) {
    const d = distanceToSolid(p, wall);
    if (d < bestDistance) {
      best = wall;
      bestDistance = d;
    }
  }
  if (best === undefined || bestDistance === 0) return undefined;
  const c = closestPointOn(p, best);
  return { x: (p.x - c.x) / bestDistance, y: (p.y - c.y) / bestDistance };
}
