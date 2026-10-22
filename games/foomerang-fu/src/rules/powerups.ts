import type { Vec2 } from '@foomerang/game-core';
import type { FuConfig } from './config';

/**
 * Slice 5: the five experimental powerups. Everything about them — where they appear, who takes
 * them, what they do, when they end — is plain deterministic state owned by the rules; the
 * renderer only draws it.
 */
export const POWER_KINDS = [
  'CAFFEINATED',
  'EXPLOSIVE_BOOMERANG',
  'SHIELD',
  'EXTRA_BOOMERANG',
  'MULTI_BOOMERANG',
  'ICE_BOOMERANG',
  'FIRE_BOOMERANG',
  'BATTLE_ROYALE',
] as const;
export type PowerKind = (typeof POWER_KINDS)[number];

/** The powers a player OWNS once taken (BATTLE_ROYALE is not kept: taking it closes the border in; battleRoyale.ts). */
export const KEPT_POWER_KINDS: readonly PowerKind[] = Object.freeze(
  POWER_KINDS.filter((kind) => kind !== 'BATTLE_ROYALE'),
);

export const isPowerKind = (value: unknown): value is PowerKind =>
  typeof value === 'string' && (POWER_KINDS as readonly string[]).includes(value);

/** A player may own at most this many powers at once (see `awardPower`). */
export const MAX_POWERS = 3;

/**
 * OWNERSHIP vs CHARGE STATE. A player's `inventory` is the list of powers they OWN, in the order they
 * got them (at most MAX_POWERS). Ownership persists across rounds for the whole match; it ends only
 * by FIFO eviction (a 4th power pushes out the oldest), by a power consuming itself (SHIELD, when it
 * blocks a hit), or when the match ends. Nothing else is stored for a power: while owned, CAFFEINATED,
 * EXTRA_BOOMERANG and EXPLOSIVE_BOOMERANG simply work (no charges, no timers); any per-round or
 * per-flight state lives on the thing it belongs to (a boomerang's `blast` flag, a swing's `spared`).
 */
export type Inventory = readonly PowerKind[];
export const NO_POWERS: Inventory = Object.freeze([]);

export const owns = (inventory: Inventory, kind: PowerKind): boolean => inventory.includes(kind);

/** FIFO: the new power goes last; when full the OLDEST is removed (returned as `evicted`). */
export function awardPower(
  inventory: Inventory,
  kind: PowerKind,
): { readonly inventory: Inventory; readonly evicted: PowerKind | undefined } {
  const full = inventory.length >= MAX_POWERS;
  return {
    inventory: Object.freeze([...(full ? inventory.slice(1) : inventory), kind]),
    evicted: full ? inventory[0] : undefined,
  };
}

/** Removing a power (a broken SHIELD) frees its slot at once and keeps the order of the rest. */
export const removePower = (inventory: Inventory, kind: PowerKind): Inventory =>
  Object.freeze(inventory.filter((k) => k !== kind));

/** A Powerup Book lying in the arena. It carries NO kind: what it awards is decided when it is taken. */
export interface Pickup {
  readonly id: number;
  readonly position: Vec2;
}

/** When the next Book appears and how many have appeared this round (the whole spawn state). */
export interface PickupClock {
  readonly spawnIn: number;
  readonly spawned: number;
}

/** How often Books appear. `OFF` is none. */
export type SpawnRate = 'OFF' | 'LOW' | 'NORMAL' | 'HIGH';

/** Where and when Books appear. Absent from the config: no powerups at all (Slices 1–4 exactly). */
export interface PowerupConfig {
  /** Fixed places, in the order the rotation uses them. */
  readonly spots: readonly Vec2[];
  /** Seconds of ACTIVE play from the start of a round to the first Book. */
  readonly firstSeconds: number;
  /** Seconds after a Book is TAKEN before another can appear (the clock is frozen while one lies there). */
  readonly intervalSeconds: number;
  readonly maxOnField: number;
  /** A player takes a Book when their body overlaps this radius around it. */
  readonly pickupRadius: number;
}

/** The shipped pacing per rate (hypotheses, not frozen): seconds into a round, then seconds after a take. */
export const SPAWN_RATES: Readonly<
  Record<Exclude<SpawnRate, 'OFF'>, { first: number; interval: number }>
> = Object.freeze({
  LOW: Object.freeze({ first: 25, interval: 90 }),
  NORMAL: Object.freeze({ first: 15, interval: 45 }),
  HIGH: Object.freeze({ first: 10, interval: 25 }),
});

/** Which kinds a player can own at the same time, as an explicit table (see POWER_COMBINATIONS). */
export interface Combination {
  readonly allowed: boolean;
  /** What the pair does together, in one sentence; the tests pin each one. */
  readonly rule: string;
}

const pair = (a: PowerKind, b: PowerKind): string => (a < b ? `${a}+${b}` : `${b}+${a}`);

const COMBINATION_TABLE: ReadonlyArray<readonly [PowerKind, PowerKind, string]> = [
  ['CAFFEINATED', 'EXPLOSIVE_BOOMERANG', 'independent: speed has no effect on the blast.'],
  ['CAFFEINATED', 'SHIELD', 'independent.'],
  ['CAFFEINATED', 'EXTRA_BOOMERANG', 'independent: both boomerangs fly at normal speed.'],
  [
    'EXPLOSIVE_BOOMERANG',
    'SHIELD',
    'independent: a shield absorbs one blast like any other lethal contact (and breaks); the owner is immune to their own blast.',
  ],
  [
    'EXPLOSIVE_BOOMERANG',
    'EXTRA_BOOMERANG',
    'every boomerang thrown, of either of the pair, is armed (each can detonate once per throw).',
  ],
  ['SHIELD', 'EXTRA_BOOMERANG', 'independent.'],
  ['CAFFEINATED', 'MULTI_BOOMERANG', 'independent: the pieces fly at normal speed.'],
  [
    'EXPLOSIVE_BOOMERANG',
    'MULTI_BOOMERANG',
    'the throw splits instead of going off; every piece is armed and goes off where its own flight ends or on an enemy.',
  ],
  [
    'SHIELD',
    'MULTI_BOOMERANG',
    'independent: a shield absorbs one piece like any other lethal contact.',
  ],
  ['EXTRA_BOOMERANG', 'MULTI_BOOMERANG', 'each boomerang thrown splits on its own.'],
  ['CAFFEINATED', 'ICE_BOOMERANG', 'independent.'],
  [
    'EXPLOSIVE_BOOMERANG',
    'ICE_BOOMERANG',
    'a direct contact freezes; the blast where it goes off still kills (the video does not show the pair).',
  ],
  [
    'SHIELD',
    'ICE_BOOMERANG',
    'an ice contact on a shielded player pops the shield and freezes them (6:54.52–6:54.55).',
  ],
  ['EXTRA_BOOMERANG', 'ICE_BOOMERANG', 'each boomerang thrown is iced.'],
  ['MULTI_BOOMERANG', 'ICE_BOOMERANG', 'every piece is iced (the video, 6:50.7).'],
  ['CAFFEINATED', 'FIRE_BOOMERANG', 'independent.'],
  [
    'EXPLOSIVE_BOOMERANG',
    'FIRE_BOOMERANG',
    'a direct contact sets alight; the blast where it goes off still kills (its ring burns on the ground, 11:59.7).',
  ],
  ['SHIELD', 'FIRE_BOOMERANG', 'a shield takes a fire hit like any lethal contact: no burn.'],
  ['EXTRA_BOOMERANG', 'FIRE_BOOMERANG', 'each boomerang thrown is on fire.'],
  ['MULTI_BOOMERANG', 'FIRE_BOOMERANG', 'every piece is on fire (the video, 10:43.5).'],
  [
    'ICE_BOOMERANG',
    'FIRE_BOOMERANG',
    'a contact does both: frozen and burning (the video does not show the pair).',
  ],
  ['CAFFEINATED', 'BATTLE_ROYALE', 'independent: Battle Royale is not kept.'],
  ['EXPLOSIVE_BOOMERANG', 'BATTLE_ROYALE', 'independent: Battle Royale is not kept.'],
  ['SHIELD', 'BATTLE_ROYALE', 'independent: Battle Royale is not kept.'],
  ['EXTRA_BOOMERANG', 'BATTLE_ROYALE', 'independent: Battle Royale is not kept.'],
  ['MULTI_BOOMERANG', 'BATTLE_ROYALE', 'independent: Battle Royale is not kept.'],
  ['ICE_BOOMERANG', 'BATTLE_ROYALE', 'independent: Battle Royale is not kept.'],
  ['FIRE_BOOMERANG', 'BATTLE_ROYALE', 'independent: Battle Royale is not kept.'],
];

/**
 * The compatibility model, explicit for every unordered pair of kinds: nothing combines by accident.
 * Every pair is currently allowed, with the rule that pair follows; `FuConfig.exclusivePairs` can
 * forbid a pair for experiments without touching the rules.
 */
export const POWER_COMBINATIONS: Readonly<Record<string, Combination>> = Object.freeze(
  Object.fromEntries(
    COMBINATION_TABLE.map(([a, b, rule]) => [pair(a, b), Object.freeze({ allowed: true, rule })]),
  ),
);

export const combinationKey = pair;

/**
 * May a player owning `held` be awarded `kind`? Never one they already own (no duplicates), never one
 * the enabled pool excludes, and never one that is not allowed with something they own.
 */
export function canCollect(held: readonly PowerKind[], kind: PowerKind, config: FuConfig): boolean {
  if (held.includes(kind)) return false;
  // BATTLE_ROYALE closes the arena's border in: an arena without one has nothing to close
  if (kind === 'BATTLE_ROYALE' && config.arena.safeZone === undefined) return false;
  if (!(config.enabledPowers ?? POWER_KINDS).includes(kind)) return false;
  const exclusive = (config.exclusivePairs ?? []).map(([a, b]) => pair(a, b));
  return held.every((other) => {
    const entry = POWER_COMBINATIONS[pair(kind, other)];
    return entry?.allowed === true && !exclusive.includes(pair(kind, other));
  });
}

/** The powers a player owning `held` could be awarded now, in POWER_KINDS order. */
export const awardPool = (held: readonly PowerKind[], config: FuConfig): PowerKind[] =>
  POWER_KINDS.filter((kind) => canCollect(held, kind, config));

/** A small integer mix (pure, no state): the same (seed, n) always gives the same number. */
export function mix(seed: number, n: number): number {
  let x = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/** Which power the `award`-th Book of the match gives, from the player's pool: a pure function of the seed. */
export const chooseAward = (
  pool: readonly PowerKind[],
  seed: number,
  award: number,
): PowerKind | undefined => (pool.length === 0 ? undefined : pool[mix(seed, award) % pool.length]);

/**
 * Where the `spawned`-th Book of `round` appears: a spot picked at random from `seed` (the match's spawn seed; owner,
 * 2026-10-22: Books must not come in a set order), or the next free one after it; undefined when every spot is taken. Pure:
 * the same seed, round and count give the same spot, so a replay is exact.
 */
export function spawnSpot(
  spawned: number,
  round: number,
  config: PowerupConfig,
  taken: readonly Vec2[],
  seed: number,
): Vec2 | undefined {
  const n = config.spots.length;
  const start = mix(mix(seed, round), spawned) % n;
  for (let i = 0; i < n; i += 1) {
    const spot = config.spots[(start + i) % n] as Vec2;
    if (!taken.some((t) => t.x === spot.x && t.y === spot.y)) return spot;
  }
  return undefined;
}
