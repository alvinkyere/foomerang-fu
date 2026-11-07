import type { Vec2 } from '@foomerang/game-core';
import {
  breakablesOf,
  fencesOf,
  circleHitsWalls,
  onGround,
  wallsOf,
  type FuArena,
  type Rect,
} from '../rules/arena';

/**
 * The smallest navigation the arenas need: a coarse grid of places a body can stand (clear of every
 * static wall by one body radius), a breadth-first distance field from a goal over the cells that are
 * currently free (closed gates and dangerous floor can be blocked per call), and a steer-towards helper.
 * No pathfinding library, no precomputed map data: it is derived from the arena's own rectangles.
 */
export const CELL = 25;

/** What a dash link costs in the plan, in cells of walking: a little more than the cells it covers (a dash is a commitment). */
const LEAP_EXTRA = 6;
/** Ground beyond a body's radius all round where a planned dash lands. */
export const LEAP_MARGIN = 4;

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly #free: Uint8Array;
  /**
   * Dash links over water (owner, 2026-11-06: a CPU dashes from land to land rather than dithering at the edge): from an edge cell, the
   * cells a dash of `leap` lands in on other ground, where the line between meets no wall. `#into[t]`: the launch cells whose dash lands in t.
   */
  readonly #links = new Map<number, number[]>();
  readonly #into = new Map<number, number[]>();
  readonly #leapCost: number;

  constructor(
    readonly arena: FuArena,
    readonly radius: number,
    readonly leap = 0,
  ) {
    this.cols = Math.ceil(arena.width / CELL);
    this.rows = Math.ceil(arena.height / CELL);
    this.#free = new Uint8Array(this.cols * this.rows);
    // props that break count as solid for planning: a CPU routes round crates and pots (it does not plan to break them)
    const walls = [...wallsOf(arena), ...breakablesOf(arena), ...fencesOf(arena)];
    const fixed: FuArena = { ...arena, turntables: [] };
    for (let cy = 0; cy < this.rows; cy += 1) {
      for (let cx = 0; cx < this.cols; cx += 1) {
        const p = this.centre(cx, cy);
        const inside =
          p.x >= radius &&
          p.y >= radius &&
          p.x <= arena.width - radius &&
          p.y <= arena.height - radius;
        // over ground all round (falling kills): its middle and eight points a body's radius out; the fixed ground only (a
        // turntable, the cross pond's raft, turns away under a plan made once)
        const grounded =
          arena.ground === undefined ||
          [
            p,
            ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({
              x: p.x + Math.cos((k * Math.PI) / 4) * radius,
              y: p.y + Math.sin((k * Math.PI) / 4) * radius,
            })),
          ].every((q) => onGround(q, fixed));
        // and off the portals' pads (rules/portals.ts): it does not know where one leads, so it routes round them
        const onPad = (arena.portals ?? []).some(
          (pad) => Math.hypot(p.x - pad.x, p.y - pad.y) < pad.radius + radius,
        );
        this.#free[cy * this.cols + cx] =
          inside && grounded && !onPad && !circleHitsWalls(p, radius, walls) ? 1 : 0;
      }
    }
    this.#leapCost = Math.ceil(leap / CELL) + LEAP_EXTRA;
    if (leap > 0 && arena.ground !== undefined) {
      for (let cy = 0; cy < this.rows; cy += 1) {
        for (let cx = 0; cx < this.cols; cx += 1) {
          if (!this.isFree(cx, cy)) continue;
          // an edge cell: a neighbour not free
          if (
            [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ].every(([dx, dy]) => this.isFree(cx + (dx as number), cy + (dy as number)))
          )
            continue;
          const from = this.centre(cx, cy);
          const at = cy * this.cols + cx;
          for (let k = 0; k < 16; k += 1) {
            const a = (k * Math.PI) / 8;
            // (it steps up to the very edge before it goes: its middle may be at the edge, so a dash starts up to a radius nearer the water
            // than the cell; it lands with ground all round it and a margin)
            const reach = leap + radius * 0.8;
            const to = { x: from.x + Math.cos(a) * reach, y: from.y + Math.sin(a) * reach };
            const [tx, ty] = this.cellOf(to);
            if (!this.isFree(tx, ty)) continue;
            const ring = radius + LEAP_MARGIN;
            if (
              ![0, 1, 2, 3, 4, 5, 6, 7].every((j) =>
                onGround(
                  {
                    x: to.x + Math.cos((j * Math.PI) / 4) * ring,
                    y: to.y + Math.sin((j * Math.PI) / 4) * ring,
                  },
                  fixed,
                ),
              )
            )
              continue;
            // over something not free on the way (else it would simply walk), and through no wall
            let gap = false;
            let blocked = false;
            for (let i = 1; i < 12; i += 1) {
              const q = {
                x: from.x + (to.x - from.x) * (i / 12),
                y: from.y + (to.y - from.y) * (i / 12),
              };
              const [qx, qy] = this.cellOf(q);
              if (!this.isFree(qx, qy)) gap = true;
              if (circleHitsWalls(q, radius, walls)) blocked = true;
            }
            if (!gap || blocked) continue;
            const t = ty * this.cols + tx;
            this.#links.set(at, [...(this.#links.get(at) ?? []), t]);
            this.#into.set(t, [...(this.#into.get(t) ?? []), at]);
          }
        }
      }
    }
  }

  /**
   * Where a dash from `from` should land to follow `field` (a dash link out of its cell that the plan goes by), or undefined when
   * walking is the way.
   */
  leapAt(field: Int16Array, from: Vec2): Vec2 | undefined {
    const [cx, cy] = this.cellOf(from);
    const at = cy * this.cols + cx;
    const here = field[at] as number;
    if (here <= 0) return undefined;
    for (const t of this.#links.get(at) ?? []) {
      const d = field[t] as number;
      if (d >= 0 && d + this.#leapCost <= here + 2) {
        // (a launch about as good as the best: the dash from here)
        const tx = t % this.cols;
        return this.centre(tx, (t - tx) / this.cols);
      }
    }
    return undefined;
  }

  centre(cx: number, cy: number): Vec2 {
    return { x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2 };
  }
  cellOf(p: Vec2): [number, number] {
    return [
      Math.min(this.cols - 1, Math.max(0, Math.floor(p.x / CELL))),
      Math.min(this.rows - 1, Math.max(0, Math.floor(p.y / CELL))),
    ];
  }
  isFree(cx: number, cy: number): boolean {
    return (
      cx >= 0 &&
      cy >= 0 &&
      cx < this.cols &&
      cy < this.rows &&
      this.#free[cy * this.cols + cx] === 1
    );
  }

  /**
   * Steps from the goal over free cells that `blocked` does not forbid (4-connected). Unreached cells
   * hold -1. The goal's own cell is used even if it is blocked or off the grid's free set (a goal
   * beside a wall still gets a field).
   */
  field(goal: Vec2, blocked: (cx: number, cy: number) => boolean): Int16Array {
    // shortest steps over free cells, walking (1 a cell, 4-connected) or by a dash link (#leapCost): a bucket queue
    const n = this.cols * this.rows;
    const dist = new Int16Array(n).fill(-1);
    const [gx, gy] = this.cellOf(goal);
    const buckets: number[][] = [[gy * this.cols + gx]];
    dist[gy * this.cols + gx] = 0;
    for (let d = 0; d < buckets.length; d += 1) {
      const bucket = buckets[d];
      if (bucket === undefined) continue;
      for (const at of bucket) {
        if ((dist[at] as number) !== d) continue;
        const cx = at % this.cols;
        const cy = (at - cx) / this.cols;
        const relax = (nb: number, cost: number): void => {
          const nd = d + cost;
          const cur = dist[nb] as number;
          if (cur !== -1 && cur <= nd) return;
          dist[nb] = nd;
          (buckets[nd] ??= []).push(nb);
        };
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!this.isFree(nx, ny) || blocked(nx, ny)) continue;
          relax(ny * this.cols + nx, 1);
        }
        // a launch cell whose dash lands here is this far plus the dash's cost
        for (const from of this.#into.get(at) ?? []) {
          const fx = from % this.cols;
          if (blocked(fx, (from - fx) / this.cols)) continue;
          relax(from, this.#leapCost);
        }
      }
    }
    return dist;
  }

  /**
   * The nearest free cell's centre (by steps over free cells from `from`'s cell) where `ok` holds, or undefined if no cell
   * it can walk to does.
   */
  nearest(from: Vec2, ok: (p: Vec2) => boolean): Vec2 | undefined {
    const steps = this.field(from, () => false);
    let best: Vec2 | undefined;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < steps.length; i += 1) {
      const d = steps[i] as number;
      if (d < 0 || d >= bestD) continue;
      const cx = i % this.cols;
      const p = this.centre(cx, (i - cx) / this.cols);
      if (!ok(p)) continue;
      bestD = d;
      best = p;
    }
    return best;
  }

  /** The distance (in cells) from a point, or -1 if the field does not reach it. */
  distanceAt(field: Int16Array, p: Vec2): number {
    const [cx, cy] = this.cellOf(p);
    return field[cy * this.cols + cx] as number;
  }

  /**
   * A point to walk towards: follow the field's descent for up to `look` cells and take the farthest
   * point on the way that a straight line from `from` can reach. Undefined if the field does not reach `from`.
   */
  steer(
    field: Int16Array,
    from: Vec2,
    look: number,
    clear: (a: Vec2, b: Vec2) => boolean,
  ): Vec2 | undefined {
    let [cx, cy] = this.cellOf(from);
    if ((field[cy * this.cols + cx] as number) < 0) {
      // standing in a blocked/unreached cell: head for the nearest reached neighbour
      let best: Vec2 | undefined;
      let bestD = Number.POSITIVE_INFINITY;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
          const d = field[ny * this.cols + nx] as number;
          if (d >= 0 && d < bestD) {
            bestD = d;
            best = this.centre(nx, ny);
          }
        }
      }
      return best;
    }
    let target = this.centre(cx, cy);
    for (let i = 0; i < look; i += 1) {
      const here = field[cy * this.cols + cx] as number;
      if (here === 0) break;
      let next: [number, number] | undefined;
      let nextD = here;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        const d = field[ny * this.cols + nx] as number;
        if (d >= 0 && d < nextD) {
          nextD = d;
          next = [nx, ny];
        }
      }
      if (next === undefined) break;
      [cx, cy] = next;
      const p = this.centre(cx, cy);
      if (!clear(from, p)) break;
      target = p;
    }
    return target;
  }
}

const grids = new WeakMap<FuArena, Map<number, NavGrid>>();
/** One grid per arena and body size, built on first use and kept. */
export function navGridFor(arena: FuArena, radius: number, leap = 0): NavGrid {
  let bySize = grids.get(arena);
  if (bySize === undefined) {
    bySize = new Map();
    grids.set(arena, bySize);
  }
  const key = radius * 100000 + Math.round(leap);
  let grid = bySize.get(key);
  if (grid === undefined) {
    grid = new NavGrid(arena, radius, leap);
    bySize.set(key, grid);
  }
  return grid;
}

/** Whether a cell's centre falls inside a rectangle inflated by `margin`. */
export const cellInRect = (
  grid: NavGrid,
  cx: number,
  cy: number,
  r: Rect,
  margin: number,
): boolean => {
  const p = grid.centre(cx, cy);
  return (
    p.x > r.x - margin &&
    p.x < r.x + r.width + margin &&
    p.y > r.y - margin &&
    p.y < r.y + r.height + margin
  );
};
