import type { Vec2 } from '@foomerang/game-core';

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

export interface FuArena {
  readonly width: number;
  readonly height: number;
  /** Solid cover. Blocks living players, thrown boomerangs and a slash's line of sight. */
  readonly walls?: readonly Rect[];
  /** Exactly one point per slot (6). Absent: the Slice 1 ellipse. */
  readonly spawns?: readonly Vec2[];
}

const NO_WALLS: readonly Rect[] = Object.freeze([]);
export const wallsOf = (arena: FuArena): readonly Rect[] => arena.walls ?? NO_WALLS;

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

/** A circle overlaps a wall only if it is STRICTLY inside its radius: touching is free, like every contact in Fu. */
export const circleHitsWalls = (p: Vec2, radius: number, walls: readonly Rect[]): boolean =>
  walls.some((wall) => distanceToRect(p, wall) < radius);

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
  walls: readonly Rect[],
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

export const lineIsClear = (a: Vec2, b: Vec2, walls: readonly Rect[]): boolean =>
  !walls.some((wall) => segmentHitsRect(a, b, wall));

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
  if (!Array.isArray(walls)) throw new RangeError('arena.walls must be a list of rectangles');
  walls.forEach((wall: unknown, index) => {
    const w = wall as Partial<Rect> | null;
    if (typeof w !== 'object' || w === null)
      throw new RangeError(`wall ${index} is not a rectangle`);
    if (!finite(w.x) || !finite(w.y) || !finite(w.width) || !finite(w.height)) {
      throw new RangeError(`wall ${index} has a non-finite number`);
    }
    if (w.width < playerRadius || w.height < playerRadius) {
      throw new RangeError(`wall ${index} is thinner than a player radius (${playerRadius})`);
    }
    if (w.x < 0 || w.y < 0 || w.x + w.width > arena.width || w.y + w.height > arena.height) {
      throw new RangeError(`wall ${index} is not inside the arena`);
    }
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
export const PRIMITIVE_ARENA: FuArena = Object.freeze({
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
