import type { Vec2 } from '@foomerang/game-core';
import { boundsOf, circleHitsWalls, wallsOf, type FuArena, type Rect } from './arena';

/**
 * Slice 6 — arena systems. Three families, all PURE FUNCTIONS OF ROUND TIME (`FuState.roundTime`, simulated
 * seconds of active play since the round began): no randomness, no wall-clock, nothing the renderer owns.
 * The same time gives the same gate phase, platform place and hazard phase, at any dt.
 */

/** A timed gate: a rectangle of solid wall while CLOSED, open floor otherwise. */
export interface GateSpec {
  readonly rect: Rect;
  /** Seconds OPEN per cycle, INCLUDING the closing warning at its end. */
  readonly openSeconds: number;
  /** The last part of the open time, in which the gate is still passable but flagged CLOSING. */
  readonly warnSeconds: number;
  readonly closedSeconds: number;
  /** Shifts the schedule (seconds); both gates of a symmetric arena use the same one. */
  readonly offsetSeconds?: number;
}

/** A moving platform: rideable floor that carries bodies standing on it. Not solid. One-dimensional. */
export interface PlatformSpec {
  readonly size: { readonly width: number; readonly height: number };
  /** Top-left corner at the two ends of its path. */
  readonly from: Vec2;
  readonly to: Vec2;
  readonly travelSeconds: number;
  /** How long it waits at each end. */
  readonly pauseSeconds: number;
  readonly offsetSeconds?: number;
}

/** A periodically lethal floor zone: SAFE → WARNING → ACTIVE → SAFE. */
export interface HazardSpec {
  readonly rect: Rect;
  readonly safeSeconds: number;
  readonly warnSeconds: number;
  readonly activeSeconds: number;
  readonly offsetSeconds?: number;
}

export type GatePhase = 'OPEN' | 'CLOSING' | 'CLOSED';
export type HazardPhase = 'SAFE' | 'WARNING' | 'ACTIVE';

/** Absorbs floating-point drift at exact phase boundaries (a boundary instant belongs to the NEW phase). */
const EPS = 1e-9;
const cycleTime = (t: number, cycle: number, offset = 0): number => {
  const u = (t + offset) % cycle;
  return (u < 0 ? u + cycle : u) + EPS;
};

/**
 * The gate's SCHEDULED phase: OPEN for `openSeconds − warnSeconds`, CLOSING for `warnSeconds`
 * (still passable), CLOSED for `closedSeconds`, repeating. (Whether a CLOSED gate has actually shut
 * also depends on nothing standing in it: see `FuState.gatesShut`.)
 */
export function gatePhaseAt(
  spec: GateSpec,
  t: number,
): { readonly phase: GatePhase; readonly secondsToChange: number } {
  const cycle = spec.openSeconds + spec.closedSeconds;
  const u = cycleTime(t, cycle, spec.offsetSeconds);
  const calm = spec.openSeconds - spec.warnSeconds;
  if (u < calm) return { phase: 'OPEN', secondsToChange: calm - u };
  if (u < spec.openSeconds) return { phase: 'CLOSING', secondsToChange: spec.openSeconds - u };
  return { phase: 'CLOSED', secondsToChange: cycle - u };
}

/** Where the platform is at time `t`, and which way it is travelling (`moving` is false while it waits at an end). */
export function platformAt(
  spec: PlatformSpec,
  t: number,
): { readonly rect: Rect; readonly direction: Vec2; readonly moving: boolean } {
  const { travelSeconds: travel, pauseSeconds: pause } = spec;
  const cycle = 2 * (travel + pause);
  const u = cycleTime(t, cycle, spec.offsetSeconds) - EPS;
  let s: number;
  let sign = 0;
  if (u < travel) {
    s = u / travel;
    sign = 1;
  } else if (u < travel + pause) s = 1;
  else if (u < 2 * travel + pause) {
    s = 1 - (u - travel - pause) / travel;
    sign = -1;
  } else s = 0;
  const dx = spec.to.x - spec.from.x;
  const dy = spec.to.y - spec.from.y;
  const length = Math.hypot(dx, dy);
  return {
    rect: {
      x: spec.from.x + dx * s,
      y: spec.from.y + dy * s,
      width: spec.size.width,
      height: spec.size.height,
    },
    direction:
      length === 0 ? { x: 0, y: 0 } : { x: (dx / length) * sign + 0, y: (dy / length) * sign + 0 }, // (+ 0 turns −0 into 0)
    moving: sign !== 0,
  };
}

/** SAFE for `safeSeconds`, WARNING for `warnSeconds`, ACTIVE (lethal) for `activeSeconds`, repeating. */
export function hazardPhaseAt(
  spec: HazardSpec,
  t: number,
): { readonly phase: HazardPhase; readonly secondsToChange: number } {
  const cycle = spec.safeSeconds + spec.warnSeconds + spec.activeSeconds;
  const u = cycleTime(t, cycle, spec.offsetSeconds);
  if (u < spec.safeSeconds) return { phase: 'SAFE', secondsToChange: spec.safeSeconds - u };
  if (u < spec.safeSeconds + spec.warnSeconds) {
    return { phase: 'WARNING', secondsToChange: spec.safeSeconds + spec.warnSeconds - u };
  }
  return { phase: 'ACTIVE', secondsToChange: cycle - u };
}

export const inRect = (p: Vec2, r: Rect): boolean =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

export const gatesOf = (arena: FuArena): readonly GateSpec[] => arena.gates ?? [];
export const platformsOf = (arena: FuArena): readonly PlatformSpec[] => arena.platforms ?? [];
export const hazardsOf = (arena: FuArena): readonly HazardSpec[] => arena.hazards ?? [];

const positive = (v: number): boolean => Number.isFinite(v) && v > 0;
const overlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** A bad arena-system definition is a programming error (RangeError), never a game state. */
export function assertValidSystems(arena: FuArena, radius: number, spawns: readonly Vec2[]): void {
  const walls = wallsOf(arena).map(boundsOf);
  const inside = (r: Rect) =>
    r.x >= 0 && r.y >= 0 && r.x + r.width <= arena.width && r.y + r.height <= arena.height;
  gatesOf(arena).forEach((gate, i) => {
    const { rect } = gate;
    if (!inside(rect)) throw new RangeError(`gate ${i} is not inside the arena`);
    if (rect.width < radius || rect.height < radius) {
      throw new RangeError(`gate ${i} is thinner than a player radius (${radius})`);
    }
    if (![gate.openSeconds, gate.warnSeconds, gate.closedSeconds].every(positive)) {
      throw new RangeError(`gate ${i} needs positive open, warning and closed times`);
    }
    if (gate.warnSeconds >= gate.openSeconds) {
      throw new RangeError(`gate ${i}: the warning must be shorter than the open time`);
    }
    if (walls.some((w) => overlap(w, rect))) throw new RangeError(`gate ${i} overlaps a wall`);
    if (spawns.some((s) => circleHitsWalls(s, radius, [rect]))) {
      throw new RangeError(`gate ${i} is on a spawn point`);
    }
  });
  platformsOf(arena).forEach((p, i) => {
    if (![p.size.width, p.size.height, p.travelSeconds].every(positive) || !(p.pauseSeconds >= 0)) {
      throw new RangeError(
        `platform ${i} needs a positive size and travel time and a pause of 0 or more`,
      );
    }
    if (p.from.x !== p.to.x && p.from.y !== p.to.y) {
      throw new RangeError(`platform ${i} moves along one axis only`);
    }
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const r: Rect = {
        x: p.from.x + (p.to.x - p.from.x) * t,
        y: p.from.y + (p.to.y - p.from.y) * t,
        width: p.size.width,
        height: p.size.height,
      };
      if (!inside(r)) throw new RangeError(`platform ${i} leaves the arena`);
      if (walls.some((w) => overlap(w, r)))
        throw new RangeError(`platform ${i} runs through a wall`);
    }
  });
  hazardsOf(arena).forEach((h, i) => {
    if (!inside(h.rect) || h.rect.width <= 0 || h.rect.height <= 0) {
      throw new RangeError(`hazard ${i} is not inside the arena`);
    }
    if (![h.safeSeconds, h.warnSeconds, h.activeSeconds].every(positive)) {
      throw new RangeError(`hazard ${i} needs positive safe, warning and active times`);
    }
    if (spawns.some((s) => inRect(s, h.rect) || circleHitsWalls(s, radius, [h.rect]))) {
      throw new RangeError(`hazard ${i} is on a spawn point`);
    }
  });
}

/** What the renderer needs to DRAW the systems right now. Pure: facts of the rules state, decided nowhere else. */
export interface SystemsView {
  readonly gates: readonly {
    readonly rect: Rect;
    /** OPEN, CLOSING (still passable: about to close), or CLOSED (solid). A gate due to close but held open by something in it shows CLOSING. */
    readonly status: GatePhase;
    /** True while it is scheduled to be closed but something is in it, so it has not shut. */
    readonly held: boolean;
    readonly secondsToChange: number;
  }[];
  readonly platforms: readonly {
    readonly rect: Rect;
    readonly direction: Vec2;
    readonly moving: boolean;
  }[];
  readonly hazards: readonly {
    readonly rect: Rect;
    readonly phase: HazardPhase;
    readonly secondsToChange: number;
  }[];
}

export function systemsView(
  arena: FuArena,
  roundTime: number,
  gatesShut: readonly boolean[],
): SystemsView {
  return {
    gates: gatesOf(arena).map((gate, k) => {
      const scheduled = gatePhaseAt(gate, roundTime);
      const shut = gatesShut[k] === true;
      const held = scheduled.phase === 'CLOSED' && !shut;
      return {
        rect: gate.rect,
        status: shut ? 'CLOSED' : held ? 'CLOSING' : scheduled.phase,
        held,
        secondsToChange: scheduled.secondsToChange,
      };
    }),
    platforms: platformsOf(arena).map((p) => platformAt(p, roundTime)),
    hazards: hazardsOf(arena).map((h) => ({ rect: h.rect, ...hazardPhaseAt(h, roundTime) })),
  };
}
