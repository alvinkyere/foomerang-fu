import type { Vec2 } from '@foomerang/game-core';
import {
  distanceToRect,
  distanceToSolid,
  lineClearTo,
  wallsOf,
  breakablesOf,
  type FuArena,
} from './arena';
import type { FuConfig } from './config';
import { spawnPosition } from './spawn';

/**
 * Where everyone starts a round (owner, 2026-10-19: "no player should spawn at the same place ever ... it must be at a fair
 * distance and not the same, especially in a row").
 *
 * Round 1: the map's own spawn points (`spawnPosition`, by slot). From round 2, for each player a place on open floor reachable
 * from the map's spawns that is
 *   - at least `spawnFreshDistance` from every place they have started this match (never the same place),
 *   - at least `spawnMoveDistance` from where they started last round (never near it twice in a row),
 *   - at least `spawnSeparation` from everyone else this round (a fair distance),
 * the most spread-out of a handful of seeded tries. Pure and deterministic: the seed is the match's (`config.seed`) and the
 * round's number, and the earlier rounds are replayed from it, so nothing about it needs to live in the state.
 */

const GRID = 30;
const TRIES = 12;

/** mulberry32, seeded from the match's seed, the round and the players (FNV-1a). */
function randomFor(seed: number, round: number, ids: readonly string[]): () => number {
  let h = 2166136261;
  const key = `${seed}|${round}|${ids.join(',')}`;
  for (let i = 0; i < key.length; i += 1) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const far = (p: Vec2, q: Vec2): number => Math.hypot(p.x - q.x, p.y - q.y);

/** Open floor: grid points a body fits at, clear of everything solid or dangerous, inside the border, reachable on foot. */
const FLOOR = new WeakMap<FuArena, Map<number, readonly Vec2[]>>();
function floorOf(arena: FuArena, radius: number): readonly Vec2[] {
  const cached = FLOOR.get(arena)?.get(radius);
  if (cached !== undefined) return cached;
  const walls = wallsOf(arena);
  const props = breakablesOf(arena);
  const zone = arena.safeZone ?? { x: 0, y: 0, width: arena.width, height: arena.height };
  const margin = radius + 4;
  const blocked = (p: Vec2): boolean =>
    p.x - margin < zone.x ||
    p.y - margin < zone.y ||
    p.x + margin > zone.x + zone.width ||
    p.y + margin > zone.y + zone.height ||
    walls.some((w) => distanceToSolid(p, w) <= margin) ||
    props.some((b) => distanceToSolid(p, b) <= margin) ||
    (arena.gates ?? []).some((g) => distanceToRect(p, g.rect) <= margin) ||
    (arena.hazards ?? []).some((h) => distanceToRect(p, h.rect) <= margin) ||
    (arena.platforms ?? []).some(
      (pl) =>
        distanceToRect(p, {
          x: Math.min(pl.from.x, pl.to.x),
          y: Math.min(pl.from.y, pl.to.y),
          width: Math.abs(pl.to.x - pl.from.x) + pl.size.width,
          height: Math.abs(pl.to.y - pl.from.y) + pl.size.height,
        }) <= margin,
    );
  const cols = Math.floor(arena.width / GRID);
  const rows = Math.floor(arena.height / GRID);
  const at = (c: number, r: number): Vec2 => ({ x: (c + 0.5) * GRID, y: (r + 0.5) * GRID });
  const open: boolean[] = [];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) open.push(!blocked(at(c, r)));
  // reachable on foot from the map's own spawn points (no pockets walled off from the fight)
  const seen = new Uint8Array(cols * rows);
  const queue: number[] = [];
  for (let slot = 0; slot < 6; slot += 1) {
    const s = spawnPosition(slot, arena);
    const c = Math.min(cols - 1, Math.max(0, Math.floor(s.x / GRID)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor(s.y / GRID)));
    const k = r * cols + c;
    if (open[k] === true && seen[k] === 0) {
      seen[k] = 1;
      queue.push(k);
    }
  }
  while (queue.length > 0) {
    const k = queue.pop() as number;
    const c = k % cols;
    const r = (k - c) / cols;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const n = nr * cols + nc;
      if (seen[n] === 1 || open[n] !== true) continue;
      if (!lineClearTo(at(c, r), at(nc, nr), radius, walls)) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  const floor: Vec2[] = [];
  for (let k = 0; k < seen.length; k += 1)
    if (seen[k] === 1) floor.push(Object.freeze(at(k % cols, Math.floor(k / cols))));
  const byRadius = FLOOR.get(arena) ?? new Map<number, readonly Vec2[]>();
  byRadius.set(radius, Object.freeze(floor));
  FLOOR.set(arena, byRadius);
  return floor;
}

type Plan = ReadonlyMap<string, Vec2>;
const PLANS = new WeakMap<FuArena, Map<string, Plan[]>>();

/** One round's places for `ids` (in slot order), given everyone's earlier places this match. */
function planRound(
  ids: readonly string[],
  config: FuConfig,
  round: number,
  history: readonly Plan[],
): Plan {
  const floor = floorOf(config.arena, config.playerRadius);
  const random = randomFor(config.seed, round, ids);
  const allowed = (id: string, p: Vec2, picked: ReadonlyMap<string, Vec2>): boolean => {
    for (const h of history) {
      const before = h.get(id);
      if (before !== undefined && far(p, before) < config.spawnFreshDistance) return false;
    }
    const last = history[history.length - 1]?.get(id);
    if (last !== undefined && far(p, last) < config.spawnMoveDistance) return false;
    for (const q of picked.values()) if (far(p, q) < config.spawnSeparation) return false;
    return true;
  };
  let best: { plan: Map<string, Vec2>; spread: number } | undefined;
  for (let attempt = 0; attempt < TRIES; attempt += 1) {
    const order = [...ids];
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j] as string, order[i] as string];
    }
    const picked = new Map<string, Vec2>();
    let ok = true;
    for (const id of order) {
      const options = floor.filter((p) => allowed(id, p, picked));
      if (options.length === 0) {
        ok = false;
        break;
      }
      if (picked.size === 0) {
        picked.set(id, options[Math.floor(random() * options.length)] as Vec2);
        continue;
      }
      // as far as possible from those already placed; a random one of the best few, so tries differ
      const scored = options
        .map((p) => ({ p, d: Math.min(...[...picked.values()].map((q) => far(p, q))) }))
        .sort((x, y) => y.d - x.d);
      const top = scored.slice(0, Math.max(1, Math.ceil(scored.length * 0.05)));
      picked.set(id, (top[Math.floor(random() * top.length)] as { p: Vec2 }).p);
    }
    if (!ok) continue;
    const at = [...picked.values()];
    let spread = Number.POSITIVE_INFINITY;
    for (let i = 0; i < at.length; i += 1)
      for (let j = i + 1; j < at.length; j += 1)
        spread = Math.min(spread, far(at[i] as Vec2, at[j] as Vec2));
    if (best === undefined || spread > best.spread) best = { plan: picked, spread };
  }
  if (best !== undefined) return new Map(ids.map((id) => [id, best.plan.get(id) as Vec2]));
  // nothing meets every rule (a tiny arena, a very long match): the place furthest from their own earlier ones and from the others
  const picked = new Map<string, Vec2>();
  for (const id of ids) {
    let choice = floor[0] as Vec2;
    let score = Number.NEGATIVE_INFINITY;
    for (const p of floor) {
      const mine = history.map((h) => h.get(id)).filter((q): q is Vec2 => q !== undefined);
      const s = Math.min(
        ...mine.map((q) => far(p, q)),
        ...[...picked.values()].map((q) => far(p, q)),
        Number.POSITIVE_INFINITY,
      );
      if (s > score) {
        score = s;
        choice = p;
      }
    }
    picked.set(id, choice);
  }
  return picked;
}

/** Where these players start round `round` of a match played with `config` (round 1: each slot's own spawn point). */
export function spawnsForRound(
  specs: readonly { readonly id: string; readonly slot: number }[],
  config: FuConfig,
  round: number,
): Plan {
  const ids = specs.map((s) => s.id);
  const key = `${config.seed}|${config.playerRadius}|${config.spawnSeparation}|${config.spawnFreshDistance}|${config.spawnMoveDistance}|${specs.map((s) => `${s.id}@${s.slot}`).join(',')}`;
  const byKey = PLANS.get(config.arena) ?? new Map<string, Plan[]>();
  PLANS.set(config.arena, byKey);
  const plans = byKey.get(key) ?? [];
  byKey.set(key, plans);
  if (plans.length === 0)
    plans.push(new Map(specs.map((s) => [s.id, spawnPosition(s.slot, config.arena)])));
  while (plans.length < round) plans.push(planRound(ids, config, plans.length + 1, plans));
  return plans[round - 1] as Plan;
}
