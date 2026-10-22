import type { Vec2 } from '@foomerang/game-core';
import {
  breakablesOf,
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

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly #free: Uint8Array;

  constructor(
    readonly arena: FuArena,
    readonly radius: number,
  ) {
    this.cols = Math.ceil(arena.width / CELL);
    this.rows = Math.ceil(arena.height / CELL);
    this.#free = new Uint8Array(this.cols * this.rows);
    // props that break count as solid for planning: a CPU routes round crates and pots (it does not plan to break them)
    const walls = [...wallsOf(arena), ...breakablesOf(arena)];
    for (let cy = 0; cy < this.rows; cy += 1) {
      for (let cx = 0; cx < this.cols; cx += 1) {
        const p = this.centre(cx, cy);
        const inside =
          p.x >= radius &&
          p.y >= radius &&
          p.x <= arena.width - radius &&
          p.y <= arena.height - radius;
        // over ground all round (falling kills): its middle and eight points a body's radius out
        const grounded =
          arena.ground === undefined ||
          [
            p,
            ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({
              x: p.x + Math.cos((k * Math.PI) / 4) * radius,
              y: p.y + Math.sin((k * Math.PI) / 4) * radius,
            })),
          ].every((q) => onGround(q, arena));
        this.#free[cy * this.cols + cx] =
          inside && grounded && !circleHitsWalls(p, radius, walls) ? 1 : 0;
      }
    }
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
    const dist = new Int16Array(this.cols * this.rows).fill(-1);
    const queue = new Int32Array(this.cols * this.rows);
    const [gx, gy] = this.cellOf(goal);
    let head = 0;
    let tail = 0;
    dist[gy * this.cols + gx] = 0;
    queue[tail++] = gy * this.cols + gx;
    while (head < tail) {
      const at = queue[head++] as number;
      const cx = at % this.cols;
      const cy = (at - cx) / this.cols;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!this.isFree(nx, ny) || blocked(nx, ny)) continue;
        const n = ny * this.cols + nx;
        if (dist[n] !== -1) continue;
        dist[n] = (dist[at] as number) + 1;
        queue[tail++] = n;
      }
    }
    return dist;
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
export function navGridFor(arena: FuArena, radius: number): NavGrid {
  let bySize = grids.get(arena);
  if (bySize === undefined) {
    bySize = new Map();
    grids.set(arena, bySize);
  }
  let grid = bySize.get(radius);
  if (grid === undefined) {
    grid = new NavGrid(arena, radius);
    bySize.set(radius, grid);
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
