import { createWorld, type Vec2, type WorldState } from '@foomerang/game-core';
import type { Boomerang } from './boomerang';
import { DASH_READY, RESTED, type DashState, type Fatigue } from './dash';
import { NO_POWERS, type Inventory, type Pickup, type PickupClock } from './powerups';
import { SLASH_READY, type SlashState } from './slash';
import { assertValidConfig, DEFAULT_FU_CONFIG, type FuConfig } from './config';
import { spawnPosition } from './spawn';
import { normalized } from './vec';

export { spawnPosition };

/**
 * Holding THROW (owner, 2026-10-19): CHARGING for `seconds` with a boomerang in hand; CANCELLED by a dash until the button is let
 * go (holding on does not charge again); NONE otherwise.
 */
export type ThrowCharge =
  | { readonly phase: 'NONE' }
  | { readonly phase: 'CHARGING'; readonly seconds: number }
  | { readonly phase: 'CANCELLED' };
export const NO_CHARGE: ThrowCharge = Object.freeze({ phase: 'NONE' });

export interface FuPlayer {
  readonly id: string;
  /** Which of the six places (spawn point, and the platform's colour/number/shape) they hold. */
  readonly slot: number;
  /** Death state. Purely a rules fact: how it LOOKS is the renderer's business. */
  readonly alive: boolean;
  /** Unit vector of the last meaningful movement direction; the throw direction. */
  readonly facing: Vec2;
  /** The melee swing: READY, or ACTIVE (can hurt) / RECOVERING (cannot) with its locked direction and time left. */
  readonly slash: SlashState;
  /** Slice 4: the burst of movement — READY, DASHING (locked direction, time left) or COOLDOWN. */
  readonly dash: DashState;
  /** Slice 4: how many successful dashes in this burst and how long until rested; see `isFatigued`. */
  readonly fatigue: Fatigue;
  /** Slice 5: the powers this player OWNS, oldest first, at most 3. Persists across rounds; see `Inventory`. */
  readonly inventory: Inventory;
  /** Slice 6: indices of hazards whose ACTIVE window already met this player's shield (they cannot be hit by it again until it ends). */
  readonly hazardSpared: readonly number[];
  /** Seconds this player has been outside the arena's safe zone without a break (0 inside it, and for the dead). */
  readonly outsideFor: number;
  /** How far THROW has been charged (see `ThrowCharge`). */
  readonly charge: ThrowCharge;
}

export type FuPhase = 'PLAYING' | 'ROUND_OVER' | 'MATCH_OVER';

export interface FuRoundOver {
  /** The survivor, or undefined for a draw (everyone died in the same step). */
  readonly winnerId: string | undefined;
  readonly resetInSeconds: number;
}

/** Slice 8: the match is decided; nothing happens after this (no step changes anything, no kill is processed). */
export interface FuMatchOver {
  readonly winnerId: string;
}

/**
 * The complete, serializable state of a Foomerang Fu match. Plain data: no clock, no randomness,
 * nothing hidden. Positions of players live in game-core's `world`; everything the combat adds
 * (death, facing, boomerangs, rounds) lives beside it. Same state + same inputs + same dt ⇒ same
 * next state.
 */
export interface FuState {
  readonly config: FuConfig;
  readonly round: number;
  readonly phase: FuPhase;
  /** Simulated seconds since the match began (the sum of every dt), across rounds. */
  readonly elapsed: number;
  /** Slice 6: simulated seconds of ACTIVE play since this round began (frozen while the round is over); every arena system is a pure function of it. */
  readonly roundTime: number;
  /** Slice 6: per timed gate, whether it has actually SHUT (a gate scheduled to close waits until nothing is in it). */
  readonly gatesShut: readonly boolean[];
  /** The ids of the arena's breakables broken this round, in the order they broke (a new round starts with none). */
  readonly broken: readonly string[];
  readonly world: WorldState;
  /** In creation order, which is the order every rule uses to break ties. */
  readonly players: readonly FuPlayer[];
  /** One per player, in the same order: each player's own boomerang. */
  readonly boomerangs: readonly Boomerang[];
  /** Slice 5: the second boomerang of each player holding TWIN_THROW, in the order they took it. Empty otherwise. */
  readonly extraBoomerangs: readonly Boomerang[];
  /** Slice 5: pickups lying in the arena, in spawn order. */
  readonly pickups: readonly Pickup[];
  /** Slice 5: the Book schedule for this round. */
  readonly pickupClock: PickupClock;
  /** Slice 5: how many Books have been taken this match (with the seed, it decides what the next one awards). */
  readonly awards: number;
  readonly roundOver: FuRoundOver | undefined;
  /** Slice 8: every player's kill count — the filled holes of their meter. Persists across rounds; reset by a rematch. */
  readonly scores: Readonly<Record<string, number>>;
  /** Slice 8: this round is a TIEBREAK: only the players who filled their meters on the same step play it (everyone else sits it out, dead). */
  readonly tiebreak: boolean;
  /** Slice 8: set once someone has won; phase is then MATCH_OVER. */
  readonly matchOver: FuMatchOver | undefined;
}

export const MAX_PLAYERS = 6;

export interface FuPlayerSpec {
  readonly id: string;
  readonly slot: number;
}

function assertValidPlayers(players: readonly FuPlayerSpec[]): void {
  if (players.length === 0) throw new RangeError('a match needs at least one player');
  if (players.length > MAX_PLAYERS)
    throw new RangeError(`a match has at most ${MAX_PLAYERS} players`);
  const ids = new Set<string>();
  const slots = new Set<number>();
  for (const { id, slot } of players) {
    if (typeof id !== 'string' || id.length === 0)
      throw new RangeError('a player id must not be empty');
    if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_PLAYERS) {
      throw new RangeError(`a slot must be an integer in [0, ${MAX_PLAYERS - 1}]`);
    }
    if (ids.has(id)) throw new RangeError(`duplicate player id: ${id}`);
    if (slots.has(slot)) throw new RangeError(`duplicate slot: ${slot}`);
    ids.add(id);
    slots.add(slot);
  }
}

/** A fresh round: everybody alive, at their spawn point, facing the middle, boomerang in hand. */
export function startRound(
  specs: readonly FuPlayerSpec[],
  config: FuConfig,
  round: number,
  elapsed: number,
  /** What each player owns coming into this round (a new match passes nothing). */
  carried: ReadonlyMap<string, Inventory> = new Map(),
  awards = 0,
  /** Slice 8: the kill counts coming in (a new match passes nothing), and, in a tiebreak, who plays. */
  match: {
    readonly scores?: Readonly<Record<string, number>>;
    readonly playing?: readonly string[];
  } = {},
): FuState {
  const centre = { x: config.arena.width / 2, y: config.arena.height / 2 };
  const spawns = specs.map((spec) => spawnPosition(spec.slot, config.arena));

  const world = createWorld({
    arena: { width: config.arena.width, height: config.arena.height },
    movement: {
      maxSpeed: config.playerSpeed,
      ...(config.deadZone === undefined ? {} : { deadZone: config.deadZone }),
    },
    bodies: specs.map((spec, index) => ({
      id: spec.id,
      position: spawns[index] as Vec2,
      radius: config.playerRadius,
    })),
  });

  const players = specs.map((spec, index): FuPlayer => {
    const at = spawns[index] as Vec2;
    return Object.freeze({
      id: spec.id,
      slot: spec.slot,
      alive: match.playing === undefined || match.playing.includes(spec.id),
      facing: normalized({ x: centre.x - at.x, y: centre.y - at.y }),
      slash: SLASH_READY,
      dash: DASH_READY,
      fatigue: RESTED,
      inventory: carried.get(spec.id) ?? NO_POWERS,
      hazardSpared: Object.freeze([]),
      outsideFor: 0,
      charge: NO_CHARGE,
    });
  });

  const boomerangs = specs.map((spec, index): Boomerang =>
    Object.freeze({
      ownerId: spec.id,
      state: 'HELD',
      position: spawns[index] as Vec2,
      direction: normalized({ x: 0, y: 0 }),
      travelled: 0,
      follow: 0,
      wallSeconds: 0,
      deflections: 0,
      deflectedBy: undefined,
      blast: false,
      absorbed: Object.freeze([]),
      power: 0,
      homing: 0,
      ricochets: 0,
    }),
  );

  // A new round gives each owner of TWIN_THROW their second boomerang, in hand.
  const twins = specs.flatMap((spec, index) =>
    (carried.get(spec.id) ?? NO_POWERS).includes('TWIN_THROW')
      ? [Object.freeze({ ...(boomerangs[index] as Boomerang) })]
      : [],
  );

  return Object.freeze({
    config,
    round,
    phase: 'PLAYING',
    elapsed,
    roundTime: 0,
    gatesShut: Object.freeze((config.arena.gates ?? []).map(() => false)),
    broken: Object.freeze([]),
    world,
    players: Object.freeze(players),
    boomerangs: Object.freeze(boomerangs),
    extraBoomerangs: Object.freeze(twins),
    pickups: Object.freeze([]),
    pickupClock: Object.freeze({ spawnIn: config.powerups?.firstSeconds ?? 0, spawned: 0 }),
    awards,
    roundOver: undefined,
    scores: Object.freeze(
      Object.fromEntries(specs.map((spec) => [spec.id, match.scores?.[spec.id] ?? 0])),
    ),
    tiebreak: match.playing !== undefined,
    matchOver: undefined,
  });
}

/** Round 1 of a new match. Configuration problems and bad player lists are RangeErrors. */
export function createFuMatch(
  players: readonly FuPlayerSpec[],
  overrides: Partial<FuConfig> = {},
): FuState {
  const config: FuConfig = Object.freeze({ ...DEFAULT_FU_CONFIG, ...overrides });
  assertValidConfig(config);
  assertValidPlayers(players);
  return startRound(players, config, 1, 0);
}

/**
 * A rematch: the same participants, the same configuration, a brand-new match — round 1, every kill meter empty,
 * every inventory cleared, all temporary combat state reset.
 */
export const rematchOf = (state: FuState): FuState =>
  startRound(
    state.players.map((p) => ({ id: p.id, slot: p.slot })),
    state.config,
    1,
    0,
  );

/** What to call the round that is on (Slice 8): ROUND n / 9, then OVERTIME ROUND k, or a TIEBREAK. */
export type RoundLabel =
  | { readonly kind: 'REGULATION'; readonly round: number; readonly of: number | undefined }
  | { readonly kind: 'OVERTIME'; readonly round: number }
  | { readonly kind: 'TIEBREAK'; readonly round: number };

export function roundLabel(state: FuState): RoundLabel {
  if (state.tiebreak) return { kind: 'TIEBREAK', round: state.round };
  const regulation = state.config.regulationRounds;
  if (regulation !== undefined && state.round > regulation)
    return { kind: 'OVERTIME', round: state.round - regulation };
  return { kind: 'REGULATION', round: state.round, of: regulation };
}
