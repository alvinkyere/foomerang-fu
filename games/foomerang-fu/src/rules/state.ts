import { createWorld, type Vec2, type WorldState } from '@foomerang/game-core';
import type { Boomerang } from './boomerang';
import { SLASH_READY, type SlashState } from './slash';
import { assertValidConfig, DEFAULT_FU_CONFIG, type FuConfig } from './config';
import { normalized } from './vec';

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
}

export type FuPhase = 'PLAYING' | 'ROUND_OVER';

export interface FuRoundOver {
  /** The survivor, or undefined for a draw (everyone died in the same step). */
  readonly winnerId: string | undefined;
  readonly resetInSeconds: number;
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
  readonly world: WorldState;
  /** In creation order, which is the order every rule uses to break ties. */
  readonly players: readonly FuPlayer[];
  /** One per player, in the same order. */
  readonly boomerangs: readonly Boomerang[];
  readonly roundOver: FuRoundOver | undefined;
}

export const MAX_PLAYERS = 6;

/** Slots sit on an ellipse around the middle, evenly spread and far apart; slot 0 at the top, then clockwise. */
export function spawnPosition(slot: number, arena: FuConfig['arena']): Vec2 {
  const angle = (slot * Math.PI) / 3 - Math.PI / 2;
  return Object.freeze({
    x: arena.width / 2 + arena.width * 0.325 * Math.cos(angle),
    y: arena.height / 2 + arena.height * (260 / 900) * Math.sin(angle),
  });
}

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
): FuState {
  const centre = { x: config.arena.width / 2, y: config.arena.height / 2 };
  const spawns = specs.map((spec) => spawnPosition(spec.slot, config.arena));

  const world = createWorld({
    arena: config.arena,
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
      alive: true,
      facing: normalized({ x: centre.x - at.x, y: centre.y - at.y }),
      slash: SLASH_READY,
    });
  });

  const boomerangs = specs.map((spec, index): Boomerang =>
    Object.freeze({
      ownerId: spec.id,
      state: 'HELD',
      position: spawns[index] as Vec2,
      direction: normalized({ x: 0, y: 0 }),
      travelled: 0,
    }),
  );

  return Object.freeze({
    config,
    round,
    phase: 'PLAYING',
    elapsed,
    world,
    players: Object.freeze(players),
    boomerangs: Object.freeze(boomerangs),
    roundOver: undefined,
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
