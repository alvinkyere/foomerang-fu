import { FIXED_TIMESTEP_SECONDS } from '@foomerang/game-core';
import {
  DEFAULT_FU_CONFIG,
  PRIMITIVE_ARENA,
  createFuMatch,
  stepFu,
  type FuConfig,
  type FuEvent,
  type FuInputs,
  type FuState,
  type PowerKind,
} from '../../src/rules';

// Shared by the Slice 5 tests. States are plain data, so a test arranges a situation by copying one.

export const DT = FIXED_TIMESTEP_SECONDS;
/**
 * Straight flight: no curve out, straight home (owner's curve, 2026-10-19, is tested in curve.test.ts). For tests whose subject
 * is something else (deflection timing, blast cover, a hit down a lane...) and that arrange it with a boomerang flying straight.
 */
export const STRAIGHT = Object.freeze({ throwCurvature: 0, returnTurnRadius: 0 });
export const C = DEFAULT_FU_CONFIG;
export const R = C.playerRadius;
export const NONE: FuInputs = new Map();
export type Press = {
  move?: { x: number; y: number };
  throw?: boolean;
  throwHeld?: boolean;
  slash?: boolean;
  dash?: boolean;
};
export const input = (entries: Record<string, Press>): FuInputs => new Map(Object.entries(entries));

export function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`test setup: no ${what}`);
  return value;
}

export const player = (s: FuState, id: string) =>
  must(
    s.players.find((p) => p.id === id),
    `player ${id}`,
  );
export const at = (s: FuState, id: string) =>
  must(
    s.world.bodies.find((b) => b.id === id),
    `body ${id}`,
  ).position;
export const boom = (s: FuState, id: string) =>
  must(
    s.boomerangs.find((b) => b.ownerId === id),
    `boomerang ${id}`,
  );
/** Every boomerang a player owns, own first, then the twin(s). */
export const weaponsOf = (s: FuState, id: string) =>
  [...s.boomerangs, ...s.extraBoomerangs].filter((b) => b.ownerId === id);
export const types = (events: readonly FuEvent[]) => events.map((e) => e.type);
export const gap = (s: FuState, a: string, b: string) =>
  Math.hypot(at(s, a).x - at(s, b).x, at(s, a).y - at(s, b).y);

const SLOTS = [0, 3, 1, 2, 4, 5];
export const LANE = { arena: { width: 30000, height: 900 } } as const;

/** A match of the given ids (default a, b) in the OPEN arena unless `overrides.arena` says otherwise. */
export function make(ids: string[] = ['a', 'b'], overrides: Partial<FuConfig> = {}): FuState {
  return createFuMatch(
    ids.map((id, i) => ({ id, slot: SLOTS[i] as number })),
    overrides,
  );
}

export function place(state: FuState, id: string, x: number, y: number): FuState {
  return {
    ...state,
    world: {
      ...state.world,
      bodies: state.world.bodies.map((b) => (b.id === id ? { ...b, position: { x, y } } : b)),
    },
    boomerangs: state.boomerangs.map((b) =>
      b.ownerId === id && b.state === 'HELD' ? { ...b, position: { x, y } } : b,
    ),
    extraBoomerangs: state.extraBoomerangs.map((b) =>
      b.ownerId === id && b.state === 'HELD' ? { ...b, position: { x, y } } : b,
    ),
  };
}
export const face = (state: FuState, id: string, x: number, y: number): FuState => ({
  ...state,
  players: state.players.map((p) => (p.id === id ? { ...p, facing: { x, y } } : p)),
});
export const kill = (state: FuState, id: string): FuState => ({
  ...state,
  players: state.players.map((p) => (p.id === id ? { ...p, alive: false } : p)),
});
export const patchPlayer = (state: FuState, id: string, patch: object): FuState => ({
  ...state,
  players: state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
});
/** Directly sets what a player OWNS (oldest first), giving TWIN_THROW owners their second boomerang. */
export function own(state: FuState, id: string, ...kinds: PowerKind[]): FuState {
  const withTwin =
    kinds.includes('TWIN_THROW') && !state.extraBoomerangs.some((b) => b.ownerId === id)
      ? [
          ...state.extraBoomerangs,
          {
            ...must(
              state.boomerangs.find((b) => b.ownerId === id),
              'boomerang',
            ),
            state: 'HELD' as const,
          },
        ]
      : state.extraBoomerangs;
  return { ...patchPlayer(state, id, { inventory: kinds }), extraBoomerangs: withTwin };
}
/** Old-style shim used by the geometry tests: truthy keys mean "owns it". */
export function patchPowers(state: FuState, id: string, patch: Record<string, unknown>): FuState {
  const kinds: PowerKind[] = [...player(state, id).inventory];
  const add = (cond: unknown, kind: PowerKind) => {
    if (cond && !kinds.includes(kind)) kinds.push(kind);
  };
  add(patch['overdrive'], 'CAFFEINATED');
  add(patch['blast'], 'EXPLOSIVE_BOOMERANG');
  add(patch['guard'], 'SHIELD');
  add(patch['twin'], 'TWIN_THROW');
  return own(state, id, ...kinds);
}
export const patchBoomerang = (
  state: FuState,
  ownerId: string,
  patch: object,
  which = 0,
): FuState => {
  let n = -1;
  const apply = (b: FuState['boomerangs'][number]) => {
    if (b.ownerId !== ownerId) return b;
    n += 1;
    return n === which ? { ...b, ...patch } : b;
  };
  return {
    ...state,
    boomerangs: state.boomerangs.map(apply),
    extraBoomerangs: state.extraBoomerangs.map(apply),
  };
};

/** A boomerang already in flight (THROWN) from `from` along `direction`, owned by `ownerId`. */
export const flying = (
  state: FuState,
  ownerId: string,
  from: { x: number; y: number },
  direction: { x: number; y: number },
  extra: object = {},
  which = 0,
): FuState =>
  patchBoomerang(
    state,
    ownerId,
    { state: 'THROWN', position: from, direction, travelled: 0, ...extra },
    which,
  );

/** Runs `count` steps of `dt`, applying `inputs` on the first step only unless `repeat` is set. */
export function run(
  state: FuState,
  count: number,
  inputs: FuInputs = NONE,
  { dt = DT, repeat = false }: { dt?: number; repeat?: boolean } = {},
): { state: FuState; events: FuEvent[] } {
  let s = state;
  const events: FuEvent[] = [];
  for (let i = 0; i < count; i += 1) {
    const result = stepFu(s, i === 0 || repeat ? inputs : NONE, dt);
    s = result.state;
    events.push(...result.events);
  }
  return { state: s, events };
}

let nextPickup = 9000;
/**
 * Lays a Book on the player and takes one step, so they collect it through the real rules. The Book's
 * award is whatever the pool allows, so this narrows the pool to `kind` for that one step.
 */
export function give(state: FuState, id: string, kind: PowerKind): FuState {
  const where = at(state, id);
  const laid: FuState = {
    ...state,
    config: { ...state.config, enabledPowers: [kind] },
    pickups: [...state.pickups, { id: (nextPickup += 1), position: { x: where.x, y: where.y } }],
  };
  const next = stepFu(laid, NONE, DT).state;
  if (player(next, id).alive && !holds(next, id, kind)) {
    throw new Error(`test setup: ${id} could not take ${kind}`);
  }
  return { ...next, config: state.config };
}
export const holds = (s: FuState, id: string, kind: PowerKind): boolean =>
  player(s, id).inventory.includes(kind);
export const has = holds;
/** A Book lying at a place (it carries no kind). */
export const book = (
  state: FuState,
  x: number,
  y: number,
  id = 1 + state.pickups.length,
): FuState => ({
  ...state,
  pickups: [...state.pickups, { id, position: { x, y } }],
});

export { PRIMITIVE_ARENA, stepFu, createFuMatch };
export type { FuConfig, FuEvent, FuInputs, FuState };
