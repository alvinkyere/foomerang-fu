import {
  FIXED_TIMESTEP_SECONDS,
  normalizeMovementInput,
  step as stepWorld,
  type InputFrame,
  type MovementInput,
  type Vec2,
} from '@foomerang/game-core';
import { teleportCatch, transition, type Boomerang } from './boomerang';
import type { FuConfig } from './config';
import {
  boundsOf,
  breakablesOf,
  nearestWallNormal,
  onGround,
  circleHitsWalls,
  closestPointOn,
  distanceToRect,
  distanceToSolid,
  lineClearTo,
  lineIsClear,
  sweepCircle,
  wallsOf,
  type Breakable,
  type Solid,
} from './arena';
import { deflectionDirection } from './deflect';
import { homeStep } from './homing';
import { split } from './multi';
import { ICE_FREEZE_SECONDS } from './ice';
import { FIRE_BURN_SECONDS } from './fire';
import { zoneAt } from './battleRoyale';
import { EXPLOSIVE_FUSE } from './explosive';
import { separateBodies } from './collision';
import {
  DASH_READY,
  RESTED,
  advanceDashing,
  advanceFatigue,
  countDash,
  distanceToCircle,
  isFatigued,
  startDash,
  type DashState,
  type Fatigue,
} from './dash';
import { applyDeaths, fullMeters, type Death, type DeathCause, type ScoreChange } from './scoring';
import { advanceSlash, inSlashRegion, SLASH_READY, startSlash, type SlashState } from './slash';
import {
  awardPool,
  awardPower,
  chooseAward,
  removePower,
  spawnSpot,
  type Pickup,
  type PowerKind,
  type Inventory,
} from './powerups';
import {
  gatePhaseAt,
  gatesOf,
  hazardPhaseAt,
  hazardsOf,
  inRect,
  platformAt,
  platformsOf,
  type GateSpec,
  type HazardSpec,
} from './systems';
import { NO_CHARGE, startRound, type FuPlayer, type FuState, type ThrowCharge } from './state';
import { distanceSquared, normalized, ZERO } from './vec';

/** One player's input for one step. Everything is optional and everything is untrusted. */
export interface FuPlayerInput {
  /** Latest thumb position, as the platform delivers it. */
  readonly move?: MovementInput;
  /** A throw was requested since the last step (a tap: a plain throw). Only the boolean `true` counts. */
  readonly throw?: boolean;
  /** THROW is held down right now (it charges; letting go throws). Only the boolean `true` counts. */
  readonly throwHeld?: boolean;
  /** A slash was requested since the last step. Only the boolean `true` counts. */
  readonly slash?: boolean;
  /** A dash was requested since the last step. Only the boolean `true` counts. */
  readonly dash?: boolean;
}
export type FuInputs = ReadonlyMap<string, FuPlayerInput>;

/** What happened this step, for presentation (sound, flashes, trails). Never read back by the rules. */
export type FuEvent =
  | {
      readonly type: 'THROWN';
      readonly playerId: string;
      readonly position: Vec2;
      readonly direction: Vec2;
      /** 0 for a tap, up to 1 for a full charge. */
      readonly power: number;
    }
  | {
      readonly type: 'SLASHED';
      readonly playerId: string;
      readonly position: Vec2;
      readonly direction: Vec2;
    }
  /** Slice 4: a dash began. `position` is where it started, `direction` the way it goes. */
  | {
      readonly type: 'DASHED';
      readonly playerId: string;
      readonly position: Vec2;
      readonly direction: Vec2;
    }
  /** Slice 5: a Powerup Book appeared (it says nothing about what it will award). */
  | { readonly type: 'POWERUP_SPAWNED'; readonly pickupId: number; readonly position: Vec2 }
  /** Slice 5: a player took a Book; `kind` is revealed only now. */
  | {
      readonly type: 'PICKED_UP';
      readonly playerId: string;
      readonly kind: PowerKind;
      readonly pickupId: number;
      readonly position: Vec2;
    }
  /** Slice 5: a power left a player's inventory: pushed out by a newer one, or a shield that broke. */
  | {
      readonly type: 'POWER_LOST';
      readonly playerId: string;
      readonly kind: PowerKind;
      readonly reason: 'EVICTED' | 'SHIELD_BROKEN';
    }
  /** A breakable prop (`id`) was broken by `byId`'s boomerang, slash or blast; `position` is its centre. */
  | {
      readonly type: 'PROP_BROKEN';
      readonly id: string;
      readonly byId: string;
      readonly cause: 'BOOMERANG' | 'SLASH' | 'BLAST';
      readonly position: Vec2;
    }
  /** A boomerang on its way out bounced off a wall or the arena's edge at `position`, now heading `direction`. */
  | {
      readonly type: 'RICOCHET';
      readonly ownerId: string;
      readonly position: Vec2;
      readonly direction: Vec2;
    }
  /** Slice 5: an armed boomerang exploded at `position`; `victims` were inside the blast with a clear line (before any guard). */
  | {
      readonly type: 'BLASTED';
      readonly ownerId: string;
      readonly position: Vec2;
      readonly radius: number;
      readonly victims: readonly string[];
    }
  /** ICE_BOOMERANG: `byId`'s iced boomerang froze `playerId` at `position` (ice.ts). */
  | {
      readonly type: 'FROZEN';
      readonly playerId: string;
      readonly byId: string;
      readonly position: Vec2;
    }
  /** FIRE_BOOMERANG: `byId`'s fire boomerang set `playerId` alight at `position`; the burn kills them later (fire.ts). */
  | {
      readonly type: 'IGNITED';
      readonly playerId: string;
      readonly byId: string;
      readonly position: Vec2;
    }
  /** ICE_BOOMERANG: `playerId`'s ice shattered at `position`; they move again. */
  | { readonly type: 'THAWED'; readonly playerId: string; readonly position: Vec2 }
  /** MULTI_BOOMERANG: `ownerId`'s throw split into pieces at `position` (multi.ts). */
  | { readonly type: 'SPLIT'; readonly ownerId: string; readonly position: Vec2 }
  /** Slice 5: a SHIELD absorbed `byId`'s lethal contact and is spent. */
  | {
      readonly type: 'SHIELD_BLOCKED';
      readonly playerId: string;
      readonly byId: string;
      readonly position: Vec2;
    }
  /** Slice 5: a Phase Dash body started / stopped overlapping a wall. */
  /** Slice 4: this player's dash count passed `dashFreeCount`; they are FATIGUED until they recover. */
  | { readonly type: 'FATIGUED'; readonly playerId: string }
  /** Slice 4: a FATIGUED player's recovery completed; full mobility is back and the dash count is reset. */
  | { readonly type: 'RECOVERED'; readonly playerId: string }
  | { readonly type: 'CAUGHT'; readonly playerId: string }
  /** TELEPORT_BOOMERANG: they went from `from` to their boomerang at `to` (and have it in hand). */
  | {
      readonly type: 'TELEPORTED';
      readonly playerId: string;
      readonly from: Vec2;
      readonly to: Vec2;
    }
  /** Slice 3: an active slash knocked an enemy boomerang off course. `direction` is where it is now flying. */
  | {
      readonly type: 'DEFLECTED';
      readonly byId: string;
      readonly ownerId: string;
      readonly position: Vec2;
      readonly direction: Vec2;
    }
  /** The failsafe: a boomerang that could not get home round the walls in time ended up back in its owner's hand. */
  /** A boomerang that could not get home dropped to the ground at `position` (its thrower picks it up or pulls it home). */
  | { readonly type: 'DROPPED'; readonly ownerId: string; readonly position: Vec2 }
  | {
      readonly type: 'HIT';
      /** The attacker whose weapon it was ('HAZARD' for the floor). Not necessarily who is CREDITED: see `creditedTo`. */
      readonly byId: string;
      readonly victimId: string;
      readonly position: Vec2;
      /** Slice 8: what killed them, as the rules resolved it. */
      readonly source: DeathCause;
      /** Slice 8: who the kill is credited to (the deflector, for a deflected boomerang); undefined: nobody (the floor). */
      readonly creditedTo: string | undefined;
    }
  /** Slice 8: a kill meter changed (a hole filled or emptied, or a penalty that found it already empty: `delta` 0). */
  | ({ readonly type: 'SCORE' } & ScoreChange)
  /** Slice 8: `winnerId` filled the last hole; the match is over at once. */
  | { readonly type: 'MATCH_WON'; readonly winnerId: string; readonly kills: number }
  /** Slice 8: these players filled their meters on the same step: a tiebreak round between only them begins. */
  | { readonly type: 'TIEBREAK_START'; readonly playerIds: readonly string[] }
  | { readonly type: 'ROUND_OVER'; readonly winnerId: string | undefined }
  /** The end beat is over: the scoreboard is up and the next round waits for a CONTINUE (`roundAdvance: ON_CONTINUE`). */
  | { readonly type: 'SCOREBOARD' }
  | { readonly type: 'ROUND_START'; readonly round: number }
  /** The round's intro is over (READY … GO): play starts now. */
  | { readonly type: 'GO' };

export interface FuStepResult {
  readonly state: FuState;
  readonly events: readonly FuEvent[];
}

/** Absorbs floating-point drift in the round-end countdown and the range check. */
const EPSILON = 1e-9;

const NO_MOVEMENT: InputFrame = new Map();

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * The same thumb, slowed to `factor` of its speed. game-core owns the dead zone, so the input is
 * inverted through it: the returned input comes out of game-core at exactly `factor × magnitude`.
 */
function slowedMove(move: MovementInput, deadZone: number, factor: number): MovementInput {
  const v = normalizeMovementInput(move, deadZone);
  const magnitude = Math.hypot(v.x, v.y);
  if (magnitude === 0) return { x: 0, y: 0 };
  const length = deadZone + factor * magnitude * (1 - deadZone);
  return { x: (v.x / magnitude) * length, y: (v.y / magnitude) * length };
}

/** A dash with no thumb and no facing (which no real player has) still goes somewhere, deterministically. */
const DEFAULT_DASH_DIRECTION: Vec2 = Object.freeze({ x: 1, y: 0 });

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

function clampToArena(at: Vec2, config: FuConfig): Vec2 {
  const r = config.boomerangRadius;
  return { x: clamp(at.x, r, config.arena.width - r), y: clamp(at.y, r, config.arena.height - r) };
}

/** What carrying the dashers (and the overdriven walkers) one sub-step produced. */
interface Carried {
  readonly world: FuState['world'];
  /** Dashers whose burst ends now: a living player stopped them. */
  readonly ends: ReadonlySet<string>;
}

const moveBodies = (world: FuState['world'], to: ReadonlyMap<string, Vec2>): FuState['world'] =>
  to.size === 0
    ? world
    : Object.freeze({
        ...world,
        bodies: Object.freeze(
          world.bodies.map((body) => {
            const next = to.get(body.id);
            return next === undefined
              ? body
              : Object.freeze({ ...body, position: Object.freeze(next) });
          }),
        ),
      });

/**
 * Carries every DASHING player one sub-step along their locked direction, and every OVERDRIVEN walker
 * along their thumb (game-core cannot exceed its own top speed). All of them are judged against the
 * SAME snapshot of positions (so who is first in the match never matters). A living player in the way
 * stops a dasher at contact and ends the burst, nobody is shoved; the arena boundary slides like
 * walking. A normal dash meets walls in the caller's separation pass (the same push-out as walking,
 * which cannot be tunnelled because a sub-step never moves a player farther than their radius). A
 * PHASE dash is carried straight along its planned line instead, up to its planned `limit`, and its
 * body is excluded from the wall push-out while it lasts.
 */
function carryBodies(
  world: FuState['world'],
  players: readonly FuPlayer[],
  dashes: readonly DashState[],
  boosted: ReadonlyMap<string, Vec2>,
  solid: ReadonlySet<string>,
  h: number,
): Carried {
  const ends = new Set<string>();
  const arrivals = new Map<string, Vec2>();
  const others = (id: string) => world.bodies.filter((b) => b.id !== id && solid.has(b.id));
  players.forEach((player, index) => {
    const body = world.bodies.find((b) => b.id === player.id);
    if (body === undefined) return;
    const dash = dashes[index] as DashState;
    const velocity = boosted.get(player.id);
    if (dash.phase !== 'DASHING' && velocity !== undefined) {
      arrivals.set(player.id, {
        x: clamp(body.position.x + velocity.x * h, body.radius, world.arena.width - body.radius),
        y: clamp(body.position.y + velocity.y * h, body.radius, world.arena.height - body.radius),
      });
      return;
    }
    if (dash.phase !== 'DASHING') return;
    const intended = dash.speed * Math.min(h, dash.remaining);
    let travel = intended;
    for (const other of others(player.id)) {
      travel = Math.min(
        travel,
        distanceToCircle(
          body.position,
          dash.direction,
          travel,
          body.radius,
          other.position,
          other.radius,
        ),
      );
    }
    const blocked = travel < intended;
    const at = {
      x: clamp(
        body.position.x + dash.direction.x * travel,
        body.radius,
        world.arena.width - body.radius,
      ),
      y: clamp(
        body.position.y + dash.direction.y * travel,
        body.radius,
        world.arena.height - body.radius,
      ),
    };
    arrivals.set(player.id, at);
    if (blocked) ends.add(player.id);
  });
  return { world: moveBodies(world, arrivals), ends };
}

/**
 * The combat rules: `{ state, events } = stepFu(state, inputs, dt)`.
 *
 * Pure and deterministic: no clock, no randomness, no I/O. `dt` is in seconds with game-core's
 * contract (0 is a no-op; negative, non-finite or too large throws RangeError — a bug in the loop
 * around the simulation). Inputs are keyed by player id; ids that are not in the match are ignored,
 * and iteration order never depends on the Map's insertion order.
 *
 * Order within a PLAYING step (every rule uses the player order the match was created with):
 *   0. the step's actions are PLANNED from the state at its start, with one priority: SLASH, then THROW,
 *      then DASH — an action that actually happens wins, one that could not happen costs nothing, and a
 *      refused action is dropped, never remembered. While DASHING, SLASH, THROW and a new DASH are all
 *      refused; DASH is also refused unless the slash is READY (so not while swinging or recovering)
 *   1. movement + facing (alive players only; game-core moves the walkers, dashers are carried along
 *      their locked direction — stopped by living players, bounded by the arena, pushed out of walls
 *      like anyone — then living players are separated from one another — see collision.ts). Dashing
 *      players take no part in thumb steering or facing
 *   2. slash timers advance, then new slashes start (only from READY with the boomerang HELD,
 *      only for the boolean `true`), then throws (only from HELD, and never during an ACTIVE swing —
 *      so when THROW and SLASH arrive on the same step the SLASH wins and the throw is dropped,
 *      whichever order the inputs were delivered in)
 *   3. boomerangs fly (a boomerang thrown this step does not also move this step). A THROWN one
 *      stops at the first wall it would touch and turns RETURNING; a RETURNING one keeps homing
 *      on its owner but is bound by the walls too, sliding along them (homing.ts: local steering,
 *      no pathfinding) and recalled by a failsafe if wall-following takes too long
 *   3b. deflection: an ACTIVE slash that has an enemy boomerang in its region knocks it off course
 *      (deflect.ts) before anyone is killed; that boomerang is not lethal on that step
 *   4. hits — boomerangs and ACTIVE slashes alike — resolved SIMULTANEOUSLY against the end-of-step
 *      positions
 *   5. round end
 *
 * Owner policy (a deliberate hypothesis, to be judged by playing): a boomerang never kills its
 * owner — not at the throw, not in flight, not on the way back. A boomerang never kills a dead
 * player, and a HELD boomerang kills nobody. A slash never kills its owner or a dead player, and
 * a player killed on the step they swing still lands that swing. A hit needs overlap: distance STRICTLY less than the
 * two radii, so exactly touching is a miss.
 */
export function stepFu(state: FuState, inputs: FuInputs, dt: number): FuStepResult {
  // game-core validates dt (and returns the world untouched for 0); do it first, for every phase.
  const probe = stepWorld(state.world, NO_MOVEMENT, dt);
  if (dt === 0) return { state, events: [] };

  // The match is decided: nothing moves, nothing can kill, nothing is scored (Slice 8: no post-victory kills).
  if (state.phase === 'MATCH_OVER') return { state, events: [] };
  if (state.phase === 'ROUND_OVER') return stepRoundOver(state, probe, dt);
  // The round's intro (READY … GO): everyone stands where they landed; nothing moves, acts or counts until GO.
  if ((state.intro ?? 0) > 0) {
    const left = (state.intro ?? 0) - dt;
    if (left > EPSILON)
      return {
        state: Object.freeze({ ...state, intro: left, elapsed: state.elapsed + dt }),
        events: [],
      };
    // GO: the intro is over (the field goes: absent means none)
    const { intro: _over, ...playing } = state;
    void _over;
    return {
      state: Object.freeze({ ...playing, elapsed: state.elapsed + dt }),
      events: [{ type: 'GO' }],
    };
  }
  return stepPlaying(state, inputs, dt);
}

function stepRoundOver(state: FuState, world: FuState['world'], dt: number): FuStepResult {
  const over = state.roundOver;
  const remaining = (over?.resetInSeconds ?? 0) - dt;
  const elapsed = state.elapsed + dt;
  // On the scoreboard: time passes, nothing else happens, until somebody continues.
  if (over?.awaitingContinue === true) {
    return { state: Object.freeze({ ...state, elapsed, world }), events: [] };
  }
  if (remaining <= EPSILON) {
    const target = state.config.targetKills;
    const full =
      target === undefined ? [] : state.players.filter((p) => (state.scores[p.id] ?? 0) >= target);
    if (full.length !== 1 && state.config.roundAdvance === 'ON_CONTINUE') {
      return {
        state: Object.freeze({
          ...state,
          elapsed,
          world,
          roundOver: Object.freeze({
            winnerId: over?.winnerId,
            resetInSeconds: 0,
            awaitingContinue: true,
          }),
        }),
        events: [{ type: 'SCOREBOARD' }],
      };
    }
    return nextRound({ ...state, world }, elapsed);
  }
  return {
    state: Object.freeze({
      ...state,
      elapsed,
      world,
      roundOver: Object.freeze({
        winnerId: over?.winnerId,
        resetInSeconds: remaining,
        awaitingContinue: false,
      }),
    }),
    events: [],
  };
}

/**
 * CONTINUE on the scoreboard (`roundAdvance: ON_CONTINUE`): the next round (or the tiebreak) begins. Anything else (play,
 * the end beat, a decided match) is left exactly as it was.
 */
export function continueRound(state: FuState): FuStepResult {
  if (state.phase !== 'ROUND_OVER' || state.roundOver?.awaitingContinue !== true)
    return { state, events: [] };
  return nextRound(state, state.elapsed);
}

/** The end of a round: the match (one full meter), a tiebreak (several), or the next round. */
function nextRound(state: FuState, elapsed: number): FuStepResult {
  const world = state.world;
  const specs = state.players.map((p) => ({ id: p.id, slot: p.slot }));
  // Whoever holds a full meter at the end of a round (only possible after a tie, or after a tiebreak in which the others
  // lost holes): one of them has won; several play a tiebreak between only them.
  const target = state.config.targetKills;
  const full =
    target === undefined ? [] : state.players.filter((p) => (state.scores[p.id] ?? 0) >= target);
  if (full.length === 1) {
    const winnerId = (full[0] as FuPlayer).id;
    return {
      state: Object.freeze({
        ...state,
        elapsed,
        world,
        phase: 'MATCH_OVER' as const,
        roundOver: undefined,
        matchOver: Object.freeze({ winnerId }),
      }),
      events: [{ type: 'MATCH_WON', winnerId, kills: state.scores[winnerId] ?? 0 }],
    };
  }
  // What each player owns (and the match's count of Books taken) and every kill count carry into the next round.
  const carried = new Map(state.players.map((p) => [p.id, p.inventory]));
  if (full.length > 1) {
    const playerIds = full.map((p) => p.id);
    const next = startRound(specs, state.config, state.round + 1, elapsed, carried, state.awards, {
      scores: state.scores,
      playing: playerIds,
    });
    return {
      state: next,
      events: [
        { type: 'TIEBREAK_START', playerIds },
        { type: 'ROUND_START', round: next.round },
      ],
    };
  }
  const next = startRound(specs, state.config, state.round + 1, elapsed, carried, state.awards, {
    scores: state.scores,
  });
  return { state: next, events: [{ type: 'ROUND_START', round: next.round }] };
}

interface Flight {
  readonly boomerang: Boomerang;
  /** Where it can hit someone this step, or undefined if it is not lethal this step. */
  readonly lethalAt: Vec2 | undefined;
  readonly caught: boolean;
  /** It could not get home (its trip round the walls failed, or its thrower died): it dropped to the ground this step. */
  readonly dropped?: boolean;
  /** THROWN/DEFLECTED: its flight out ended this step (its range ran out, or an impact turned it home) here. An armed one goes off here. */
  readonly ended?: Vec2;
  /** The path it flew this step when it bounced (start, each bounce, end); hits are judged along it. */
  readonly path?: readonly Vec2[];
  /** An armed boomerang's fuse ran out this step: it goes off where it lies (explosive.ts). */
  readonly detonate?: boolean;
}

/** Where a lethal contact came from, in the order a guard absorbs them. */
interface Contact {
  readonly attacker: number; // the arena itself (a hazard) counts as the last attacker
  readonly rank: number; // 0 boomerang / blast, 1 slash, 2 hazard
  readonly weapon: number; // index into the weapon list, -1 for a slash or hazard
  readonly source: DeathCause;
  /** Slice 8: who is CREDITED (index), or -1 for nobody. The attacker, except for a deflected boomerang (the deflector). */
  readonly credit: number;
  /** ICE_BOOMERANG: an iced boomerang's contact: it freezes instead of killing. */
  readonly ice?: boolean;
  /** FIRE_BOOMERANG: a fire boomerang's contact: it sets alight instead of killing at once. */
  readonly fire?: boolean;
}

const CANCELLED: ThrowCharge = Object.freeze({ phase: 'CANCELLED' });

/** What a boomerang becomes in its thrower's hand: everything about the trip cleared. */
const IN_HAND = Object.freeze({
  direction: ZERO,
  travelled: 0,
  follow: 0 as const,
  wallSeconds: 0,
  deflections: 0,
  deflectedBy: undefined,
  absorbed: Object.freeze([]) as readonly string[],
  power: 0,
  homing: 0,
  ricochets: 0,
  velocity: ZERO,
  recall: 0,
  respawn: 0,
});

/**
 * A dropped boomerang sliding over `dt` under kinetic friction (constant deceleration `mu`), integrated exactly: it moves
 * v·dt − μ·dt²/2 and slows to v − μ·dt, or, if it stops within the step, moves v²/2μ and stops. Walls and the arena's edge stop
 * the part of its velocity going into them; it slides on along them.
 */
function slide(
  from: Vec2,
  velocity: Vec2,
  mu: number,
  dt: number,
  config: FuConfig,
  walls: readonly Solid[],
): { readonly position: Vec2; readonly velocity: Vec2 } {
  const v = Math.hypot(velocity.x, velocity.y);
  if (v === 0) return { position: from, velocity: ZERO };
  const dir = { x: velocity.x / v, y: velocity.y / v };
  const stops = v <= mu * dt;
  const distance = stops ? (v * v) / (2 * mu) : v * dt - (mu * dt * dt) / 2;
  const after = stops ? 0 : v - mu * dt;
  const free = { x: from.x + dir.x * distance, y: from.y + dir.y * distance };
  const swept = sweepCircle(from, free, config.boomerangRadius, walls);
  const edge = edgeCrossing(from, dir, distance, config);
  const wallAt = swept.blocked
    ? Math.hypot(swept.position.x - from.x, swept.position.y - from.y) / distance
    : Number.POSITIVE_INFINITY;
  if (wallAt === Number.POSITIVE_INFINITY && edge === undefined)
    return { position: free, velocity: stops ? ZERO : { x: dir.x * after, y: dir.y * after } };
  // it meets something: it stops there, keeping only the velocity along the surface
  const f = edge !== undefined && edge.at < wallAt ? edge.at : wallAt;
  const at =
    f === wallAt
      ? swept.position
      : { x: from.x + dir.x * distance * f, y: from.y + dir.y * distance * f };
  const n =
    f === wallAt
      ? (nearestWallNormal(at, walls) ?? { x: -dir.x, y: -dir.y })
      : (edge as { normal: Vec2 }).normal;
  const vx = dir.x * after;
  const vy = dir.y * after;
  const into = vx * n.x + vy * n.y;
  const kept = into < 0 ? { x: vx - into * n.x, y: vy - into * n.y } : { x: vx, y: vy };
  return { position: at, velocity: Math.hypot(kept.x, kept.y) < 1e-9 ? ZERO : kept };
}

/** Where a boomerang moving from `from` along `dir` for `length` first leaves the arena's inner box (its centre's bounds), as a
 * fraction of `length`, with that edge's inward normal; undefined if it stays inside. */
function edgeCrossing(
  from: Vec2,
  dir: Vec2,
  length: number,
  config: FuConfig,
): { readonly at: number; readonly normal: Vec2 } | undefined {
  const r = config.boomerangRadius;
  let best: { at: number; normal: Vec2 } | undefined;
  const consider = (bound: number, p: number, d: number, normal: Vec2) => {
    if (d === 0) return;
    // (already on or past the bound and moving out: it meets the edge at once, never flies on beyond it)
    const t = Math.max(0, (bound - p) / (d * length));
    if (t <= 1 && (best === undefined || t < best.at)) best = { at: t, normal };
  };
  if (dir.x < 0) consider(r, from.x, dir.x, { x: 1, y: 0 });
  if (dir.x > 0) consider(config.arena.width - r, from.x, dir.x, { x: -1, y: 0 });
  if (dir.y < 0) consider(r, from.y, dir.y, { x: 0, y: 1 });
  if (dir.y > 0) consider(config.arena.height - r, from.y, dir.y, { x: 0, y: -1 });
  return best;
}

/** The closest a victim (moving straight from `b0` to `b1` over the step) comes to a path flown over the same step. */
function approachAlong(path: readonly Vec2[], b0: Vec2, b1: Vec2): number {
  const total = path.reduce(
    (sum, p, i) =>
      i === 0 ? 0 : sum + Math.hypot(p.x - (path[i - 1] as Vec2).x, p.y - (path[i - 1] as Vec2).y),
    0,
  );
  let done = 0;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < path.length; i += 1) {
    const a0 = path[i - 1] as Vec2;
    const a1 = path[i] as Vec2;
    const len = Math.hypot(a1.x - a0.x, a1.y - a0.y);
    const t0 = total === 0 ? 0 : done / total;
    const t1 = total === 0 ? 1 : (done + len) / total;
    const at = (t: number) => ({ x: b0.x + (b1.x - b0.x) * t, y: b0.y + (b1.y - b0.y) * t });
    best = Math.min(best, closestApproach(a0, a1, at(t0), at(t1)));
    done += len;
  }
  return path.length < 2
    ? Math.hypot((path[0] as Vec2).x - b1.x, (path[0] as Vec2).y - b1.y)
    : best;
}

/** The closest two points come while each moves in a straight line from its first position to its second. */
function closestApproach(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): number {
  const rx = a0.x - b0.x;
  const ry = a0.y - b0.y;
  const dx = a1.x - b1.x - rx;
  const dy = a1.y - b1.y - ry;
  const d2 = dx * dx + dy * dy;
  const t = d2 === 0 ? 0 : Math.min(1, Math.max(0, -(rx * dx + ry * dy) / d2));
  return Math.hypot(rx + dx * t, ry + dy * t);
}

/** Who a kill by the arena is credited to. */
const ARENA_ID = 'HAZARD';

/** The solid geometry right now: the static walls plus every timed gate that has shut. */
const solidNow = (
  statics: readonly Solid[],
  gates: readonly GateSpec[],
  shut: readonly boolean[],
): readonly Solid[] =>
  gates.some((_g, k) => shut[k] === true)
    ? [...statics, ...gates.flatMap((g, k) => (shut[k] === true ? [g.rect] : []))]
    : statics;

const EMPTY: readonly string[] = Object.freeze([]);
/** A pickup is taken within this of the body when the config has no schedule of its own (hand-placed pickups). */
const DEFAULT_PICKUP_RADIUS = 28;

function stepPlaying(state: FuState, inputs: FuInputs, dt: number): FuStepResult {
  const { config } = state;
  const staticWalls = wallsOf(config.arena);
  const gates = gatesOf(config.arena);
  const platforms = platformsOf(config.arena);
  const hazards = hazardsOf(config.arena);
  const gatesShut: boolean[] = [...state.gatesShut];
  let walls: readonly Solid[] = solidNow(staticWalls, gates, gatesShut);
  // Breakables: solid to bodies while standing (as at the start of the step); boomerangs fly through them
  const breakables = breakablesOf(config.arena);
  const brokenNow: string[] = [...state.broken];
  const standing = breakables.filter((b) => !state.broken.includes(b.id));
  const forBodies = (w: readonly Solid[]): readonly Solid[] =>
    standing.length === 0 ? w : [...w, ...standing];
  let bodyWalls: readonly Solid[] = forBodies(walls);
  const deadZone = state.world.movement.deadZone;
  const events: FuEvent[] = [];
  const R = config.playerRadius;
  const count = state.players.length;
  const ownerOf = new Map(state.players.map((p, index) => [p.id, index]));

  // 0. Plan the actions, from the state at the start of the step ---------------------------------
  const entries = state.players.map((player) => {
    const raw = inputs.get(player.id);
    return isObject(raw) ? (raw as FuPlayerInput) : undefined;
  });
  const dashingAtStart = state.players.map((p) => p.alive && p.dash.phase === 'DASHING');
  // ICE_BOOMERANG: frozen in ice: they stand still and can do nothing (ice.ts)
  const frozenAtStart = state.players.map((p) => p.alive && (p.frozen ?? 0) > EPSILON);
  // What each player OWNS (oldest first). Changes only by a Book, FIFO eviction or a shield breaking.
  const inventory: Inventory[] = state.players.map((p) => p.inventory);
  const has = (index: number, kind: PowerKind): boolean =>
    (inventory[index] as Inventory).includes(kind);
  const overdriven = state.players.map((p, index) => p.alive && has(index, 'CAFFEINATED'));
  // Every boomerang in one list: each player's own (same order as the players), then the twins. A twin
  // whose owner is not in the match is an impossible state and is dropped, never obeyed.
  const startExtras = state.extraBoomerangs.filter((b) => ownerOf.has(b.ownerId));
  const startWeapons = [...state.boomerangs, ...startExtras];
  const heldAny = state.players.map((p) =>
    startWeapons.some((w) => w.ownerId === p.id && w.state === 'HELD'),
  );
  // Calling a dropped boomerang home (THROW held, nothing in hand to charge): they stand still in the calling pose, as in the
  // reference video (the banana at 0:18.5, arms out until it arrives).
  const calling = state.players.map(
    (p, index) =>
      p.alive &&
      entries[index]?.throwHeld === true &&
      heldAny[index] !== true &&
      startWeapons.some(
        (w) => w.ownerId === p.id && (w.state === 'GROUNDED' || w.state === 'RECALLING'),
      ),
  );

  // 1a. Facing. A dashing player is committed: the thumb neither steers nor turns them.
  const moved: FuPlayer[] = state.players.map((player, index) => {
    const move = entries[index]?.move;
    if (
      !player.alive ||
      dashingAtStart[index] === true ||
      frozenAtStart[index] === true ||
      !isObject(move)
    )
      return player;
    const direction = normalized(normalizeMovementInput(move, deadZone));
    if (direction.x === 0 && direction.y === 0) return player; // not a meaningful direction
    return Object.freeze({ ...player, facing: direction });
  });

  // 1b. Who does what this step. Priority SLASH > THROW > DASH; an action that could not happen does
  // not block a lower one. (Slash timers are advanced here only to judge readiness; step 2 stores them.)
  const slashAfter = state.players.map((p) =>
    p.alive ? advanceSlash(p.slash, dt, config) : SLASH_READY,
  );
  // The recovery clock runs down first, so a press on the step it completes counts as dash number 1.
  const restedAfter = state.players.map((p) => (p.alive ? advanceFatigue(p.fatigue, dt) : RESTED));
  state.players.forEach((p, index) => {
    if (
      p.alive &&
      isFatigued(p.fatigue, config) &&
      !isFatigued(restedAfter[index] as Fatigue, config)
    ) {
      events.push({ type: 'RECOVERED', playerId: p.id });
    }
  });
  const plans = moved.map((player, index) => {
    const entry = entries[index];
    const committed = dashingAtStart[index] === true || frozenAtStart[index] === true; // mid-dash or frozen: no slash, throw or new dash
    const hasFacing = player.facing.x !== 0 || player.facing.y !== 0;
    const held = heldAny[index] === true; // at least one boomerang in hand (enough for a SLASH)
    const throwReady = held; // one in hand is enough: a throw throws one (EXTRA_BOOMERANG's second can go while the first is out)
    const slashes =
      player.alive &&
      !committed &&
      entry?.slash === true &&
      (slashAfter[index] as SlashState).phase === 'READY' &&
      held &&
      hasFacing;
    // a tap throws; so does letting go of a charge (the release is the first step THROW is no longer held)
    const charge = state.players[index]?.charge ?? NO_CHARGE;
    const released = charge.phase === 'CHARGING' && entry?.throwHeld !== true;
    const throws =
      player.alive &&
      !committed &&
      (entry?.throw === true || released) &&
      !slashes && // a same-step SLASH always wins
      (slashAfter[index] as SlashState).phase !== 'ACTIVE' && // the weapon is mid-swing
      throwReady &&
      hasFacing;
    const dashes =
      player.alive &&
      !committed &&
      entry?.dash === true &&
      !slashes &&
      !throws &&
      (slashAfter[index] as SlashState).phase === 'READY'; // not while swinging or recovering
    const power =
      charge.phase === 'CHARGING' ? Math.min(1, charge.seconds / config.fullChargeSeconds) : 0;
    // what the charge is after this step: a throw spends it, a dash cancels it until THROW is let go; it builds while THROW
    // is held with every boomerang the throw needs in hand. A hold that is calling a dropped boomerang home is not a charge
    // either: once it is caught, letting go throws nothing (a new press does)
    const holding = player.alive && entry?.throwHeld === true;
    const nextCharge: ThrowCharge = throws
      ? NO_CHARGE
      : dashes || calling[index] === true
        ? holding
          ? CANCELLED
          : NO_CHARGE
        : !holding
          ? NO_CHARGE
          : charge.phase === 'CANCELLED'
            ? CANCELLED
            : throwReady && !committed
              ? Object.freeze({
                  phase: 'CHARGING',
                  seconds: (charge.phase === 'CHARGING' ? charge.seconds : 0) + dt,
                })
              : NO_CHARGE;
    return { slashes, throws, dashes, power, nextCharge };
  });

  // TELEPORT_BOOMERANG (the owner, 2026-10-22): with nothing in hand, a press of THROW takes them to their boomerang that is
  // out, the first of them (each press the next: MULTI_BOOMERANG's pieces, an EXTRA_BOOMERANG twin), and it is in hand again.
  // Not to one lying with its fuse lit: that one goes off where it lies. The press is the step THROW goes down (a tap, or the
  // first step it is held): a press that has already teleported is spent (CANCELLED) until THROW is let go, so it neither
  // goes twice nor charges the throw of the boomerang it has just brought back.
  const teleportTo: (number | undefined)[] = moved.map((player, index) => {
    const committed = dashingAtStart[index] === true || frozenAtStart[index] === true;
    if (!player.alive || committed || heldAny[index] === true) return undefined;
    const entry = entries[index];
    const pressed =
      entry?.throw === true ||
      (entry?.throwHeld === true && state.players[index]?.charge.phase !== 'CANCELLED');
    if (!pressed || !has(index, 'TELEPORT_BOOMERANG')) return undefined;
    const k = startWeapons.findIndex(
      (w) =>
        w.ownerId === player.id &&
        w.state !== 'HELD' &&
        w.state !== 'SPENT' &&
        w.fuse === undefined,
    );
    return k < 0 ? undefined : k;
  });
  teleportTo.forEach((k, index) => {
    if (k === undefined) return;
    const plan = plans[index] as (typeof plans)[number];
    plans[index] = {
      ...plan,
      nextCharge: entries[index]?.throwHeld === true ? CANCELLED : NO_CHARGE,
    };
  });

  // 1c. Movement. Walkers go through game-core; dashers (and overdriven walkers) are carried.
  const frame = new Map<string, MovementInput>();
  const boosted = new Map<string, Vec2>();
  const dashDirection = (player: FuPlayer): Vec2 =>
    player.facing.x !== 0 || player.facing.y !== 0 ? player.facing : DEFAULT_DASH_DIRECTION;
  const fatigue: Fatigue[] = [...restedAfter];
  const dashes: DashState[] = state.players.map((player, index) => {
    if ((plans[index] as { dashes: boolean }).dashes) {
      // A successful dash: it counts, the recovery clock starts again, and the 9th (default) is the first tired one.
      const direction = dashDirection(moved[index] as FuPlayer);
      fatigue[index] = countDash(fatigue[index] as Fatigue, config, dt);
      const tired = isFatigued(fatigue[index] as Fatigue, config);
      if ((fatigue[index] as Fatigue).dashes === config.dashFreeCount + 1) {
        events.push({ type: 'FATIGUED', playerId: player.id });
      }
      const origin = state.world.bodies.find((b) => b.id === player.id)?.position ?? ZERO;
      const boostedDash = overdriven[index] === true;
      events.push({ type: 'DASHED', playerId: player.id, position: origin, direction });
      return startDash(direction, config, tired, boostedDash);
    }
    return state.players[index]?.alive ? (player.dash as DashState) : DASH_READY;
  });
  moved.forEach((player, index) => {
    const move = entries[index]?.move;
    if (
      !player.alive ||
      (dashes[index] as DashState).phase === 'DASHING' ||
      calling[index] === true ||
      frozenAtStart[index] === true ||
      !isObject(move)
    )
      return;
    // Slowed while committed to a swing and while fatigued, sped up under CAFFEINATED (they multiply).
    const factor =
      (player.slash.phase === 'READY' ? 1 : config.slashMoveFactor) *
      (isFatigued(fatigue[index] as Fatigue, config) ? config.fatiguedMoveFactor : 1) *
      (overdriven[index] === true ? config.caffeinatedMoveFactor : 1);
    if (factor > 1) {
      // faster than game-core's top speed: carried here (same arithmetic: direction × speed × time)
      const v = normalizeMovementInput(move, deadZone);
      boosted.set(player.id, {
        x: v.x * config.playerSpeed * factor,
        y: v.y * config.playerSpeed * factor,
      });
    } else frame.set(player.id, factor === 1 ? move : slowedMove(move, deadZone, factor));
  });
  // Move in sub-steps no longer than the fixed step, separating living players after each, so that no
  // supported dt can carry one player through another or through a wall. (dt = the fixed step is exactly
  // one sub-step.)
  const solid = new Set(state.players.filter((p) => p.alive).map((p) => p.id));
  const subSteps = Math.max(1, Math.ceil(dt / FIXED_TIMESTEP_SECONDS - 1e-9));
  const h = dt / subSteps;
  let world = state.world;
  // Hazard contacts seen over the sub-steps (judged at each sub-step's end, so a large dt cannot skip a strip).
  const hazardHits: Set<number>[] = state.players.map(() => new Set<number>());
  const onPlatformAt = (at: Vec2, t: number): boolean =>
    platforms.some((p) => inRect(at, platformAt(p, t).rect));
  for (let i = 0; i < subSteps; i += 1) {
    const tStart = state.roundTime + i * h;
    const tEnd = state.roundTime + (i + 1) * h;
    // Timed gates: scheduled CLOSED but not yet shut? Shut only once nothing living or flying overlaps the gate.
    gates.forEach((gate, k) => {
      if (gatePhaseAt(gate, tEnd).phase !== 'CLOSED') {
        gatesShut[k] = false;
      } else if (gatesShut[k] !== true) {
        const busy =
          world.bodies.some(
            (b) => solid.has(b.id) && distanceToRect(b.position, gate.rect) < b.radius,
          ) ||
          startWeapons.some(
            (w) =>
              w.state !== 'HELD' &&
              w.state !== 'SPENT' &&
              distanceToRect(w.position, gate.rect) < config.boomerangRadius,
          );
        if (!busy) gatesShut[k] = true;
      }
    });
    walls = solidNow(staticWalls, gates, gatesShut);
    bodyWalls = forBodies(walls);
    // Riders (standing on a platform at the start of the sub-step, not mid-dash) are carried with it.
    const rides = new Map<string, Vec2>();
    platforms.forEach((platform) => {
      const from = platformAt(platform, tStart).rect;
      const to = platformAt(platform, tEnd).rect;
      const delta = { x: to.x - from.x, y: to.y - from.y };
      if (delta.x === 0 && delta.y === 0) return;
      world.bodies.forEach((b) => {
        const index = ownerOf.get(b.id);
        if (index === undefined || !solid.has(b.id) || rides.has(b.id)) return;
        if ((dashes[index] as DashState).phase === 'DASHING' || !inRect(b.position, from)) return;
        rides.set(b.id, delta);
      });
    });
    world = stepWorld(world, frame, h);
    if (rides.size > 0) {
      world = moveBodies(
        world,
        new Map(
          world.bodies.flatMap((b) => {
            const d = rides.get(b.id);
            return d === undefined
              ? []
              : [
                  [
                    b.id,
                    {
                      x: clamp(b.position.x + d.x, b.radius, world.arena.width - b.radius),
                      y: clamp(b.position.y + d.y, b.radius, world.arena.height - b.radius),
                    },
                  ] as [string, Vec2],
                ];
          }),
        ),
      );
    }
    const carried = carryBodies(world, state.players, dashes, boosted, solid, h);
    world = carried.world;
    for (let j = 0; j < dashes.length; j += 1) {
      const dash = dashes[j] as DashState;
      if (dash.phase !== 'DASHING') continue;
      const id = (state.players[j] as FuPlayer).id;
      dashes[j] = advanceDashing(dash, h, carried.ends.has(id));
    }
    world = separateBodies(world, (id) => solid.has(id), bodyWalls);
    // Hazards: an ACTIVE strip is lethal to a living body whose centre is on it — unless it is riding a
    // platform over it, or an earlier shield already met this window.
    hazards.forEach((hazard, hi) => {
      if (hazardPhaseAt(hazard, tEnd).phase !== 'ACTIVE') return;
      world.bodies.forEach((b) => {
        const index = ownerOf.get(b.id);
        if (index === undefined || !solid.has(b.id)) return;
        if (!inRect(b.position, hazard.rect) || onPlatformAt(b.position, tEnd)) return;
        if ((state.players[index] as FuPlayer).hazardSpared.includes(hi)) return;
        (hazardHits[index] as Set<number>).add(hi);
      });
    });
  }
  // the teleports, once everyone has moved: each lands where its boomerang is, pushed clear of walls and the arena's edge
  if (teleportTo.some((k) => k !== undefined)) {
    const to = new Map<string, Vec2>();
    teleportTo.forEach((k, index) => {
      if (k === undefined) return;
      const id = (state.players[index] as FuPlayer).id;
      const p = (startWeapons[k] as Boomerang).position;
      const body = world.bodies.find((b) => b.id === id);
      const r = body?.radius ?? R;
      to.set(id, {
        x: clamp(p.x, r, world.arena.width - r),
        y: clamp(p.y, r, world.arena.height - r),
      });
    });
    const before = new Map(world.bodies.map((b) => [b.id, b.position]));
    world = separateBodies(moveBodies(world, to), (id) => solid.has(id), bodyWalls);
    for (const [id] of to) {
      const landed = world.bodies.find((b) => b.id === id)?.position ?? ZERO;
      events.push({ type: 'TELEPORTED', playerId: id, from: before.get(id) ?? ZERO, to: landed });
    }
  }
  const teleported = new Set(teleportTo.filter((k): k is number => k !== undefined));
  const positionOf = (id: string): Vec2 => {
    const body = world.bodies.find((b) => b.id === id);
    return body === undefined ? ZERO : body.position;
  };
  const startPosition = new Map(state.world.bodies.map((b) => [b.id, b.position]));

  // 2. Pickups are collected on the end-of-movement positions, before anything is thrown or hit ---
  // Pickups are visited in id order; each goes to the NEAREST eligible player (a tie goes to the earlier
  // player in the match); a player takes at most one per step. A pickup is out of reach behind a wall.
  const reachSquared = (R + (config.powerups?.pickupRadius ?? DEFAULT_PICKUP_RADIUS)) ** 2;
  const took = new Set<number>();
  const newTwins: Boomerang[] = [];
  const lying: Pickup[] = [];
  let awards = state.awards;
  let closingSince = state.closingSince;
  for (const pickup of [...state.pickups].sort((a, b) => a.id - b.id)) {
    let best: number | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    state.players.forEach((p, index) => {
      if (!p.alive || took.has(index)) return;
      const where = positionOf(p.id);
      const d = distanceSquared(where, pickup.position);
      if (d >= reachSquared || d >= bestDistance) return;
      if (!lineIsClear(where, pickup.position, walls)) return;
      if (awardPool(inventory[index] as Inventory, config).length === 0) return; // nothing to award them
      best = index;
      bestDistance = d;
    });
    if (best === undefined) {
      lying.push(pickup);
      continue;
    }
    // Only now, on collection, is the power decided: a pure function of the seed, how many Books have been
    // taken this match, and what this player can still be awarded. Nothing about it exists before.
    const taker = state.players[best] as FuPlayer;
    const kind = chooseAward(
      awardPool(inventory[best] as Inventory, config),
      config.seed,
      awards,
    ) as PowerKind;
    awards += 1;
    took.add(best);
    // BATTLE_ROYALE is not kept: the border starts closing in (once a round)
    if (kind === 'BATTLE_ROYALE') closingSince ??= state.roundTime;
    const given =
      kind === 'BATTLE_ROYALE'
        ? { inventory: inventory[best] as Inventory, evicted: undefined }
        : awardPower(inventory[best] as Inventory, kind);
    inventory[best] = given.inventory;
    events.push({
      type: 'PICKED_UP',
      playerId: taker.id,
      kind,
      pickupId: pickup.id,
      position: pickup.position,
    });
    if (given.evicted !== undefined) {
      events.push({
        type: 'POWER_LOST',
        playerId: taker.id,
        kind: given.evicted,
        reason: 'EVICTED',
      });
    }
    if (kind === 'EXTRA_BOOMERANG') {
      newTwins.push(
        Object.freeze({
          ownerId: taker.id,
          state: 'HELD',
          position: positionOf(taker.id),
          direction: ZERO,
          travelled: 0,
          follow: 0,
          wallSeconds: 0,
          deflections: 0,
          deflectedBy: undefined,
          blast: false,
          absorbed: EMPTY,
          power: 0,
          homing: 0,
          ricochets: 0,
          velocity: ZERO,
          recall: 0,
          respawn: 0,
        } satisfies Boomerang),
      );
    }
  }

  // The weapon list for the rest of the step. HELD boomerangs ride along with their owners.
  let weapons: Boomerang[] = [...startWeapons, ...newTwins].map((b) =>
    b.state === 'HELD' ? Object.freeze({ ...b, position: positionOf(b.ownerId) }) : b,
  );
  const ownerIdx: number[] = weapons.map((w) => ownerOf.get(w.ownerId) as number);

  // 3. Slashes, then throws ---------------------------------------------------------------------
  const players: FuPlayer[] = moved.map((player, index) => {
    let slash = slashAfter[index] as SlashState;
    const facing = player.facing;
    if ((plans[index] as { slashes: boolean }).slashes) {
      slash = startSlash(facing, config);
      events.push({
        type: 'SLASHED',
        playerId: player.id,
        position: positionOf(player.id),
        direction: facing,
      });
    }
    const dash = dashes[index] as DashState;
    const rested = fatigue[index] as Fatigue;
    return slash === player.slash && dash === player.dash && rested === player.fatigue
      ? player
      : Object.freeze({ ...player, slash, dash, fatigue: rested });
  });

  // One THROW press throws ONE boomerang straight ahead: the player's own if it is in hand, else (an owner of EXTRA_BOOMERANG)
  // the extra. The reference video, 7:18.95 and 7:19.15: the second goes while the first is still out. Each is independent.
  const thrownNow = new Set<number>();
  const rotate = (v: Vec2, angle: number): Vec2 => ({
    x: v.x * Math.cos(angle) - v.y * Math.sin(angle),
    y: v.x * Math.sin(angle) + v.y * Math.cos(angle),
  });
  state.players.forEach((_p, index) => {
    if (!(plans[index] as { throws: boolean }).throws) return;
    const mine = weapons.flatMap((w, k) =>
      ownerIdx[k] === index && w.state === 'HELD' ? [k] : [],
    );
    if (mine.length === 0) return;
    const player = players[index] as FuPlayer;
    const gap = config.playerRadius + config.boomerangRadius + 1; // starts just outside its owner
    const owner = positionOf(player.id);
    mine.slice(0, 1).forEach((k) => {
      const direction = player.facing;
      // Pressed against a wall, the boomerang starts as close to the owner as the wall allows; it then
      // meets the wall on its first step and turns straight back.
      const position = sweepCircle(
        owner,
        clampToArena({ x: owner.x + direction.x * gap, y: owner.y + direction.y * gap }, config),
        config.boomerangRadius,
        walls,
      ).position;
      thrownNow.add(k);
      // An owner of EXPLOSIVE_BOOMERANG arms every boomerang they throw (each can detonate once per throw).
      const arm = has(index, 'EXPLOSIVE_BOOMERANG');
      const power = (plans[index] as { power: number }).power;
      events.push({ type: 'THROWN', playerId: player.id, position, direction, power });
      weapons[k] = transition(weapons[k] as Boomerang, 'THROWN', {
        position,
        direction,
        travelled: 0,
        blast: arm,
        split: has(index, 'MULTI_BOOMERANG'),
        ice: has(index, 'ICE_BOOMERANG'),
        fire: has(index, 'FIRE_BOOMERANG'), // (the reference video: it splits at its first enemy or where its flight out ends)
        power,
      });
    });
  });

  // 4. Flight ---------------------------------------------------------------------------------
  const reach = config.playerRadius + config.boomerangRadius;
  // ...but it kills only on the body as drawn (`hitRadius`; the owner: what is drawn is what kills)
  const hitReach = (config.hitRadius ?? config.playerRadius) + config.boomerangRadius;
  const flights: Flight[] = weapons.map((b, k) => {
    if (b.state === 'HELD') return { boomerang: b, lethalAt: undefined, caught: false };
    if (teleported.has(k))
      // its thrower is here now (TELEPORT_BOOMERANG): in hand again, harmless this step
      return {
        boomerang: teleportCatch(b, { ...IN_HAND, position: positionOf(b.ownerId) }),
        lethalAt: undefined,
        caught: true,
      };
    if (thrownNow.has(k)) return { boomerang: b, lethalAt: b.position, caught: false };
    if (b.state === 'SPENT' && b.splitInto === true) {
      // split (MULTI_BOOMERANG): back in its thrower's hand once the last of its pieces is gone
      const of = k < count ? 0 : 1;
      const out = weapons.some((p) => p.ownerId === b.ownerId && p.pieceOf === of);
      return {
        boomerang: out
          ? b
          : transition(b, 'HELD', {
              ...IN_HAND,
              splitInto: false,
              position: positionOf(b.ownerId),
            }),
        lethalAt: undefined,
        caught: false,
      };
    }
    if (b.state === 'SPENT') {
      // destroyed by its own blast: nowhere, harmless; a new one is in its thrower's hand when the time is up
      const respawn = b.respawn - dt;
      return {
        boomerang:
          respawn <= EPSILON
            ? transition(b, 'HELD', { ...IN_HAND, position: positionOf(b.ownerId) })
            : Object.freeze({ ...b, respawn }),
        lethalAt: undefined,
        caught: false,
      };
    }

    if (b.state === 'THROWN' || b.state === 'DEFLECTED') {
      // A deflected boomerang flies just like a thrown one — straight, at throw speed, stopped by walls —
      // but only for `deflectRange`, after which it turns RETURNING and goes home the usual way.
      // a charged throw flies faster and further (`power` 0..1 between the plain and the fully charged throw)
      const range =
        b.state === 'DEFLECTED'
          ? config.deflectRange
          : config.throwRange + (config.chargedThrowRange - config.throwRange) * b.power;
      const speed = config.throwSpeed + (config.chargedThrowSpeed - config.throwSpeed) * b.power;
      // a thrown boomerang curves (clockwise on screen) along an arc, the less the more it was charged; a deflected one flies
      // straight. Each piece of the step moves along the arc's chord and turns the heading by curvature × length. Meeting a
      // wall or the arena's edge it bounces (R = V − 2(V·N)N) and flies on for the rest of the step, up to `maxRicochets` a
      // throw; after that an impact turns it home.
      const curvature = b.state === 'THROWN' ? config.throwCurvature * (1 - b.power) : 0;
      let left = Math.min(speed * dt, range - b.travelled);
      let position = b.position;
      let heading = b.direction;
      let travelled = b.travelled;
      let ricochets = b.ricochets;
      let stopped = false;
      const path: Vec2[] = [b.position];
      for (let leg = 0; leg <= config.maxRicochets + 1 && left > EPSILON; leg += 1) {
        const turn = curvature * left;
        const chord = turn > 1e-12 ? (2 * Math.sin(turn / 2)) / curvature : left;
        const along = rotate(heading, turn / 2);
        const free = { x: position.x + along.x * chord, y: position.y + along.y * chord };
        // the first thing it meets along the chord: a wall, or the arena's edge
        const swept = sweepCircle(position, free, config.boomerangRadius, walls);
        const wallAt = swept.blocked
          ? Math.hypot(swept.position.x - position.x, swept.position.y - position.y) / chord
          : Number.POSITIVE_INFINITY;
        const edge = edgeCrossing(position, along, chord, config);
        if (wallAt === Number.POSITIVE_INFINITY && edge === undefined) {
          position = free;
          heading = turn > 0 ? normalized(rotate(heading, turn)) : heading;
          travelled += left;
          break;
        }
        const f = edge !== undefined && edge.at < wallAt ? edge.at : wallAt;
        const hit =
          f === wallAt
            ? swept.position
            : { x: position.x + along.x * chord * f, y: position.y + along.y * chord * f };
        const flown = left * f;
        travelled += flown;
        left -= flown;
        const incoming = normalized(rotate(heading, curvature * flown));
        position = hit;
        path.push(hit);
        const normal =
          f === wallAt
            ? (nearestWallNormal(hit, walls) ?? { x: -incoming.x, y: -incoming.y })
            : (edge as { normal: Vec2 }).normal;
        const dot = incoming.x * normal.x + incoming.y * normal.y;
        heading =
          dot < 0
            ? normalized({ x: incoming.x - 2 * dot * normal.x, y: incoming.y - 2 * dot * normal.y })
            : incoming;
        events.push({ type: 'RICOCHET', ownerId: b.ownerId, position: hit, direction: heading });
        if (ricochets >= config.maxRicochets) {
          // out of bounces: this one knocks it down (the reference video): it drops, sliding off the way it bounced
          stopped = true;
          break;
        }
        ricochets += 1;
      }
      if (path.length > 1) path.push(position);
      const extra: Pick<Flight, 'path'> = path.length > 2 ? { path } : {};
      if (stopped)
        // knocked down: it lies where it fell, sliding to a stop, until its thrower picks it up or calls it
        return {
          boomerang: transition(b, 'GROUNDED', {
            position,
            direction: heading,
            velocity: { x: heading.x * speed, y: heading.y * speed },
            travelled: 0,
            ricochets,
            recall: 0,
            follow: 0,
            deflectedBy: undefined,
          }),
          lethalAt: position,
          caught: false,
          dropped: true,
          ended: position,
          ...extra,
        };
      if (travelled >= range - EPSILON) {
        // its range is used up: it hooks round (returnTurnRadius) and homes on its thrower
        return {
          boomerang: transition(b, 'RETURNING', {
            position,
            direction: heading,
            homing: 0,
            travelled: 0,
            follow: 0,
            wallSeconds: 0,
            deflectedBy: undefined,
            absorbed: EMPTY,
          }),
          lethalAt: position,
          caught: false,
          ended: position,
          ...extra,
        };
      }
      return {
        boomerang: Object.freeze({ ...b, position, travelled, direction: heading, ricochets }),
        lethalAt: position,
        caught: false,
        ...extra,
      };
    }

    const owner = positionOf(b.ownerId);
    const ownerIndex = ownerIdx[k] as number;
    const ownerAlive = (state.players[ownerIndex] as FuPlayer).alive;
    // holding THROW now: what pulls a dropped boomerang home
    const pulling = ownerAlive && entries[ownerIndex]?.throwHeld === true;
    const caughtNow = (position: Vec2): Flight => ({
      boomerang: transition(b, 'HELD', { ...IN_HAND, position: owner }),
      lethalAt: b.state === 'RECALLING' ? position : undefined,
      caught: true,
    });

    if (b.state === 'GROUNDED' && b.fuse !== undefined) {
      // an armed boomerang ticking where it landed: nobody picks it up or pulls it home; it goes off when the fuse runs out
      const fuse = b.fuse - dt;
      return fuse <= EPSILON
        ? {
            boomerang: Object.freeze({ ...b, fuse: 0 }),
            lethalAt: b.position,
            caught: false,
            detonate: true,
          }
        : { boomerang: Object.freeze({ ...b, fuse }), lethalAt: undefined, caught: false };
    }

    if (b.state === 'GROUNDED') {
      // its thrower walks over it: picked up
      if (ownerAlive && Math.hypot(owner.x - b.position.x, owner.y - b.position.y) <= reach)
        return caughtNow(b.position);
      const recall = pulling ? b.recall + dt : 0;
      if (recall >= config.recallDelaySeconds - EPSILON)
        // held long enough: it lifts, and is pulled from the next step
        return {
          boomerang: transition(b, 'RECALLING', { recall: 0, follow: 0 }),
          lethalAt: undefined,
          caught: false,
        };
      const slid = slide(b.position, b.velocity, config.groundFriction, dt, config, walls);
      const moved = Object.freeze({
        ...b,
        position: slid.position,
        velocity: slid.velocity,
        recall,
      });
      // (picked up as it slides into her)
      if (ownerAlive && Math.hypot(owner.x - slid.position.x, owner.y - slid.position.y) <= reach)
        return caughtNow(slid.position);
      return { boomerang: moved, lethalAt: undefined, caught: false };
    }

    if (b.state === 'RECALLING') {
      if (!pulling)
        // let go: it drops, keeping the velocity it had, and slides to a stop from the next step
        return {
          boomerang: transition(b, 'GROUNDED', { recall: 0, follow: 0 }),
          lethalAt: undefined,
          caught: false,
        };
      // constant acceleration up to the cap; the distance this step is exact (the mean of the two speeds × dt)
      const v0 = Math.hypot(b.velocity.x, b.velocity.y);
      const v1 = Math.min(config.recallSpeed, v0 + config.recallAcceleration * dt);
      const along = ((v0 + v1) / 2) * dt;
      const pulled = homeStep(
        b.position,
        owner,
        along,
        config.boomerangRadius,
        walls,
        config.arena,
        b.follow,
      );
      const d = { x: pulled.position.x - b.position.x, y: pulled.position.y - b.position.y };
      const len = Math.hypot(d.x, d.y);
      const toOwner = normalized({ x: owner.x - b.position.x, y: owner.y - b.position.y });
      const heading = len > 1e-9 ? { x: d.x / len, y: d.y / len } : toOwner;
      if (Math.hypot(owner.x - pulled.position.x, owner.y - pulled.position.y) <= reach)
        return caughtNow(pulled.position);
      return {
        boomerang: Object.freeze({
          ...b,
          position: pulled.position,
          velocity: { x: heading.x * v1, y: heading.y * v1 },
          direction: heading,
          follow: pulled.follow,
        }),
        lethalAt: pulled.position, // airborne and moving: as lethal as any flying boomerang
        caught: false,
      };
    }

    // a boomerang whose thrower is dead has no hand to return to: it drops, keeping its flight speed, and slides to a stop
    if (!ownerAlive)
      return {
        boomerang: transition(b, 'GROUNDED', {
          velocity: {
            x: b.direction.x * config.returnSpeed,
            y: b.direction.y * config.returnSpeed,
          },
          recall: 0,
          follow: 0,
          wallSeconds: 0,
          deflectedBy: undefined,
        }),
        lethalAt: undefined,
        caught: false,
        dropped: true,
      };

    // RETURNING: home in on the owner's CURRENT position.
    const travel = config.returnSpeed * dt;
    const home = (position: Vec2, arrived: boolean, extra: Partial<typeof b>) =>
      ({
        // It can still hurt on the step it arrives, so lethality is judged at `position` before it is caught.
        boomerang: arrived
          ? transition(b, 'HELD', { ...IN_HAND, position: owner })
          : Object.freeze({ ...b, position, homing: b.homing + dt, ...extra }),
        lethalAt: position,
        caught: arrived,
      }) satisfies Flight;

    // The hook home (the reference video, 0:37.9): it keeps its heading and turns towards its thrower no faster than
    // returnSpeed / returnTurnRadius, a rate that grows with the trip, so it comes round on a tight curve and is caught
    // (returnTurnRadius 0: it turns at once, a straight line home).
    {
      const dx = owner.x - b.position.x;
      const dy = owner.y - b.position.y;
      const want = Math.atan2(dy, dx);
      const from =
        b.direction.x === 0 && b.direction.y === 0
          ? want
          : Math.atan2(b.direction.y, b.direction.x);
      let delta = want - from;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      const most =
        config.returnTurnRadius > 0
          ? (config.returnSpeed / config.returnTurnRadius + config.returnTurnGrowth * b.homing) * dt
          : Number.POSITIVE_INFINITY;
      const angle = from + Math.max(-most, Math.min(most, delta));
      const heading = { x: Math.cos(angle), y: Math.sin(angle) };
      const free = { x: b.position.x + heading.x * travel, y: b.position.y + heading.y * travel };
      const bounded = clampToArena(free, config);
      const blocked =
        bounded.x !== free.x ||
        bounded.y !== free.y ||
        (walls.length > 0 && sweepCircle(b.position, free, config.boomerangRadius, walls).blocked);
      if (!blocked) {
        // caught if it passes within reach of the thrower during the step
        const ex = free.x - b.position.x;
        const ey = free.y - b.position.y;
        const t = Math.max(0, Math.min(1, (dx * ex + dy * ey) / (ex * ex + ey * ey)));
        const near = Math.hypot(b.position.x + ex * t - owner.x, b.position.y + ey * t - owner.y);
        return home(free, near <= reach, { direction: heading });
      }
      // Something in the way home (the reference video, 0:39.1): it bounces off and drops, sliding on the way it bounced,
      // and lies there until its thrower picks it up or calls it. It does not find its own way round.
      const swept = sweepCircle(b.position, free, config.boomerangRadius, walls);
      const edge = edgeCrossing(b.position, heading, travel, config);
      const wallAt = swept.blocked
        ? Math.hypot(swept.position.x - b.position.x, swept.position.y - b.position.y)
        : Number.POSITIVE_INFINITY;
      const byEdge = edge !== undefined && edge.at * travel < wallAt;
      const hit = byEdge
        ? {
            x: b.position.x + heading.x * travel * (edge as { at: number }).at,
            y: b.position.y + heading.y * travel * (edge as { at: number }).at,
          }
        : swept.blocked
          ? swept.position
          : bounded;
      const normal = byEdge
        ? (edge as { normal: Vec2 }).normal
        : (nearestWallNormal(hit, walls) ?? { x: -heading.x, y: -heading.y });
      const dot = heading.x * normal.x + heading.y * normal.y;
      const off =
        dot < 0
          ? normalized({ x: heading.x - 2 * dot * normal.x, y: heading.y - 2 * dot * normal.y })
          : heading;
      events.push({ type: 'RICOCHET', ownerId: b.ownerId, position: hit, direction: off });
      return {
        boomerang: transition(b, 'GROUNDED', {
          position: hit,
          direction: off,
          velocity: { x: off.x * config.returnSpeed, y: off.y * config.returnSpeed },
          recall: 0,
          follow: 0,
          wallSeconds: 0,
        }),
        lethalAt: hit,
        caught: false,
        dropped: true,
      };
    }
  });
  const flownFrom = weapons; // where each boomerang was before it flew this step
  weapons = flights.map((f) => f.boomerang);
  flights.forEach((f, k) => {
    if (f.dropped === true)
      events.push({
        type: 'DROPPED',
        ownerId: f.boomerang.ownerId,
        position: f.boomerang.position,
      });
    if (!f.caught) return;
    const owner = ownerIdx[k] as number;
    events.push({ type: 'CAUGHT', playerId: (players[owner] as FuPlayer).id });
    // home again: whatever armed this throw is spent; the NEXT throw is armed afresh while BLAST is owned
    weapons[k] = Object.freeze({
      ...(weapons[k] as Boomerang),
      blast: false,
      split: false,
      ice: false,
      fire: false,
    });
  });

  // 4a. Breakables ------------------------------------------------------------------------------
  // A boomerang breaks every standing prop its path touched this step and flies on: they never stop one. Credited to
  // whoever sent it (the deflector of a deflected one). A slash and a blast break props too (below); a dash never does.
  const breakProp = (prop: Breakable, byId: string, cause: 'BOOMERANG' | 'SLASH' | 'BLAST') => {
    if (brokenNow.includes(prop.id)) return;
    brokenNow.push(prop.id);
    const box = boundsOf(prop);
    events.push({
      type: 'PROP_BROKEN',
      id: prop.id,
      byId,
      cause,
      position: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    });
  };
  if (breakables.length > 0)
    flights.forEach((f, k) => {
      const before = flownFrom[k] as Boomerang;
      // (sliding on the ground breaks nothing; nor does one destroyed by its blast)
      if (before.state === 'HELD' || before.state === 'GROUNDED' || before.state === 'SPENT')
        return;
      const to = f.lethalAt ?? f.boomerang.position;
      const byId =
        before.state === 'DEFLECTED' && before.deflectedBy !== undefined
          ? before.deflectedBy
          : before.ownerId;
      for (const prop of breakables) {
        if (brokenNow.includes(prop.id)) continue;
        const r = config.boomerangRadius;
        if (circleHitsWalls(to, r, [prop]) || sweepCircle(before.position, to, r, [prop]).blocked)
          breakProp(prop, byId, 'BOOMERANG');
      }
    });

  // 4b. Deflection (Slice 3) ---------------------------------------------------------------------
  // A boomerang inside an ENEMY'S ACTIVE slash region (with a clear line to it) is knocked off course
  // instead of being lethal this step. Judged on end-of-step positions, before anyone is killed, so a
  // slash pressed on the very step a boomerang would have killed still saves. At most one defender per
  // boomerang per step: the nearest to it, and on an exact tie the earliest in player order — never the
  // order inputs arrived in. A boomerang cannot be deflected by whoever just deflected it (until it has
  // turned RETURNING), nor more than `maxDeflections` times per throw. (Slice 5: it also cannot
  // detonate that step, and each boomerang of a pair is judged on its own.)
  const lethalAt: (Vec2 | undefined)[] = flights.map((f) => f.lethalAt);
  weapons.forEach((b, k) => {
    // (a boomerang lying on the ground cannot be knocked away, nor one its blast destroyed; one pulled home is flying, and can)
    if (
      b.state === 'HELD' ||
      b.state === 'GROUNDED' ||
      b.state === 'SPENT' ||
      b.deflections >= config.maxDeflections
    )
      return;
    let best: number | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    players.forEach((defender, j) => {
      if (j === ownerIdx[k] || !defender.alive || defender.id === b.deflectedBy) return;
      const swing = defender.slash;
      if (swing.phase !== 'ACTIVE') return;
      const from = positionOf(defender.id);
      if (!inSlashRegion(from, swing.direction, b.position, config)) return;
      if (!lineIsClear(from, b.position, walls)) return;
      const d = distanceSquared(from, b.position);
      if (d < bestDistance) {
        bestDistance = d;
        best = j; // strictly nearer wins; a tie keeps the earlier player
      }
    });
    if (best === undefined) return;
    const defender = players[best] as FuPlayer;
    const swing = defender.slash;
    if (swing.phase !== 'ACTIVE') return; // (narrowing: it is ACTIVE by construction)
    const before = (flownFrom[k] as Boomerang).position;
    const movedBy = Math.hypot(b.position.x - before.x, b.position.y - before.y);
    const toOwner = positionOf(b.ownerId);
    const incoming =
      movedBy > 1e-9
        ? normalized({ x: b.position.x - before.x, y: b.position.y - before.y })
        : b.direction.x !== 0 || b.direction.y !== 0
          ? b.direction
          : normalized({ x: toOwner.x - b.position.x, y: toOwner.y - b.position.y });
    const out = deflectionDirection(
      incoming.x === 0 && incoming.y === 0 ? swing.direction : incoming,
      swing.direction,
    );
    weapons[k] = transition(b, 'DEFLECTED', {
      direction: out,
      travelled: 0,
      follow: 0,
      wallSeconds: 0,
      deflections: b.deflections + 1,
      deflectedBy: defender.id,
      absorbed: EMPTY,
      power: 0,
      ricochets: 0,
    });
    lethalAt[k] = undefined; // the clank absorbs it: it kills nobody on the step it is deflected
    events.push({
      type: 'DEFLECTED',
      byId: defender.id,
      ownerId: b.ownerId,
      position: b.position,
      direction: out,
    });
  });

  // 5. Hits (simultaneous: everyone alive at the start of the step can be hit) ---------------
  // Every lethal contact is collected first, per victim, in a fixed order (attacker's place in the match,
  // then boomerangs/blasts before the slash, then the weapon); then a SHIELD takes the FIRST one and the
  // rest kill. An armed boomerang's first contact, or the end of its flight out, is an explosion instead: everyone
  // (not its owner, not whoever just deflected it) within `blastRadius` with a clear line is a victim.
  const contacts: Contact[][] = players.map(() => []);
  const newPieces: Boomerang[] = []; // MULTI_BOOMERANG: the pieces of this step's splits
  const blastRadiusSquared = config.blastRadius * config.blastRadius;
  weapons.forEach((w, k) => {
    const at = lethalAt[k];
    if (at === undefined) return;
    const a = ownerIdx[k] as number;
    // A deflected boomerang is credited to whoever deflected it (they sent it; its owner is immune to it anyway);
    // every other weapon is credited to its owner. Twins and blasts follow the same rule.
    // (judged on the leg it flew this step: one whose deflected flight ended this step has already turned home)
    const leg = (flownFrom[k] as Boomerang).state === 'DEFLECTED' ? (flownFrom[k] as Boomerang) : w;
    const credit =
      leg.state === 'DEFLECTED' && leg.deflectedBy !== undefined
        ? (ownerOf.get(leg.deflectedBy) ?? a)
        : a;
    // (a shield it met on this leg still covers the step it is caught in: its list is cleared by the catch, but the path
    // judged this step began on that leg)
    const immuneTo = (victim: FuPlayer): boolean =>
      (leg.state === 'DEFLECTED' && leg.deflectedBy === victim.id) ||
      w.absorbed.includes(victim.id) ||
      (flownFrom[k] as Boomerang).absorbed.includes(victim.id);
    const touched: number[] = [];
    // swept: the closest the boomerang and the victim came during the step, both moving in straight lines (a charged throw
    // moves 40 u a step; judged only where it ends, it could pass a player by)
    const from =
      (flownFrom[k] as Boomerang).state === 'HELD' ? at : (flownFrom[k] as Boomerang).position;
    players.forEach((victim, v) => {
      if (v === a || !victim.alive || immuneTo(victim)) return;
      const start = startPosition.get(victim.id) ?? positionOf(victim.id);
      if (approachAlong(flights[k]?.path ?? [from, at], start, positionOf(victim.id)) < hitReach)
        touched.push(v);
    });
    // an armed boomerang goes off at its first contact with a player, or where its flight out ended (walls only bounce it)
    const ended = flights[k]?.ended;
    const blastAt = touched.length === 0 ? (ended ?? at) : at;
    if (w.split === true && (touched.length > 0 || ended !== undefined)) {
      // MULTI_BOOMERANG: it splits there instead (multi.ts); whoever it touched is hit by it, and every piece carries its powers
      for (const v of touched)
        contacts[v]?.push({
          attacker: a,
          rank: 0,
          weapon: k,
          source: 'BOOMERANG',
          credit,
          ...(w.ice === true ? { ice: true } : {}),
          ...(w.fire === true ? { fire: true } : {}),
        });
      const heading =
        w.direction.x === 0 && w.direction.y === 0
          ? (flownFrom[k] as Boomerang).direction
          : w.direction;
      newPieces.push(...split(w, blastAt, normalized(heading), k < count ? 0 : 1));
      weapons[k] = transition(w, 'SPENT', {
        ...IN_HAND,
        position: blastAt,
        blast: false,
        split: false,
        splitInto: true,
      });
      events.push({ type: 'SPLIT', ownerId: w.ownerId, position: blastAt });
      return;
    }
    const detonate = flights[k]?.detonate === true;
    if (
      w.blast &&
      touched.length === 0 &&
      ended !== undefined &&
      !detonate &&
      w.fuse === undefined
    ) {
      // EXPLOSIVE_BOOMERANG: where its flight out ended it lands and lies ticking for the fuse (explosive.ts)
      const lying = {
        position: blastAt,
        velocity: ZERO,
        recall: 0,
        follow: 0 as const,
        travelled: 0,
        fuse: EXPLOSIVE_FUSE,
      };
      weapons[k] =
        w.state === 'GROUNDED'
          ? Object.freeze({ ...w, ...lying })
          : transition(w, 'GROUNDED', lying);
      return;
    }
    if (w.blast && (touched.length > 0 || detonate)) {
      const hit = new Set(touched);
      players.forEach((victim, v) => {
        if (v === a || !victim.alive || immuneTo(victim)) return;
        const where = positionOf(victim.id);
        if (
          distanceSquared(blastAt, where) < blastRadiusSquared &&
          lineClearTo(blastAt, where, R, walls)
        )
          hit.add(v);
      });
      const ordered = [...hit].sort((x, y) => x - y);
      for (const v of ordered)
        contacts[v]?.push({ attacker: a, rank: 0, weapon: k, source: 'BLAST', credit });
      for (const prop of breakables)
        if (
          !brokenNow.includes(prop.id) &&
          distanceToSolid(blastAt, prop) < config.blastRadius &&
          lineIsClear(blastAt, closestPointOn(blastAt, prop), walls)
        )
          breakProp(prop, w.ownerId, 'BLAST');
      // its own blast destroys it; a new one is in its thrower's hand `explosiveRespawnSeconds` later (no fuse left on it)
      const { fuse: _spentFuse, ...unfused } = w;
      void _spentFuse;
      weapons[k] = transition(unfused, 'SPENT', {
        ...IN_HAND,
        position: blastAt,
        blast: false,
        respawn: config.explosiveRespawnSeconds,
      });
      events.push({
        type: 'BLASTED',
        ownerId: w.ownerId,
        position: blastAt,
        radius: config.blastRadius,
        victims: ordered.map((v) => (players[v] as FuPlayer).id),
      });
    } else {
      for (const v of touched)
        contacts[v]?.push({
          attacker: a,
          rank: 0,
          weapon: k,
          source: 'BOOMERANG',
          credit,
          ...(w.ice === true ? { ice: true } : {}),
          ...(w.fire === true ? { fire: true } : {}),
        });
    }
  });
  const swings: FuPlayer[] = [...players];
  players.forEach((attacker, a) => {
    const swing = attacker.slash;
    if (swing.phase !== 'ACTIVE') return;
    const from = positionOf(attacker.id);
    players.forEach((victim, v) => {
      if (v === a || !victim.alive || swing.spared?.includes(victim.id) === true) return;
      const where = positionOf(victim.id);
      if (
        inSlashRegion(from, swing.direction, where, config) &&
        lineClearTo(from, where, R, walls)
      ) {
        contacts[v]?.push({ attacker: a, rank: 1, weapon: -1, source: 'SLASH', credit: a }); // a wall is cover: no cutting through it
      }
    });
    for (const prop of breakables) {
      if (brokenNow.includes(prop.id)) continue;
      const near = closestPointOn(from, prop);
      if (inSlashRegion(from, swing.direction, near, config) && lineIsClear(from, near, walls))
        breakProp(prop, attacker.id, 'SLASH');
    }
  });
  hazardHits.forEach((hits, v) => {
    if (hits.size === 0 || !(players[v] as FuPlayer).alive) return;
    (contacts[v] as Contact[]).push({
      attacker: count,
      rank: 2,
      weapon: -1,
      source: 'HAZARD',
      credit: -1,
    });
  });
  // The border: time outside the safe zone, continuous; at the limit the player explodes (no shield can stop it)
  // (Battle Royale: the border as it has closed in by the end of this step)
  const zone = zoneAt(config.arena, closingSince, state.roundTime + dt);
  const outsideFor = players.map((p) =>
    zone === undefined || !p.alive || inRect(positionOf(p.id), zone)
      ? 0
      : (state.players.find((q) => q.id === p.id)?.outsideFor ?? 0) + dt,
  );
  const exploding = new Set<number>();
  outsideFor.forEach((t, v) => {
    if (t < config.outsideLimitSeconds - EPSILON) return;
    exploding.add(v);
    (contacts[v] as Contact[]).push({
      attacker: count,
      rank: 3,
      weapon: -1,
      source: 'OUT_OF_BOUNDS',
      credit: -1,
    });
  });
  // Falling: a living player whose middle has left the ground falls and dies (no shield can stop it; nobody is credited)
  players.forEach((p, v) => {
    if (!p.alive || onGround(positionOf(p.id), config.arena)) return;
    exploding.add(v);
    (contacts[v] as Contact[]).push({
      attacker: count,
      rank: 3,
      weapon: -1,
      source: 'FALL',
      credit: -1,
    });
  });
  const hazardSpared: number[][] = state.players.map((p) => [...p.hazardSpared]);
  const freezing = new Set<number>(); // ICE_BOOMERANG: frozen by this step's contacts
  const igniting = new Map<number, NonNullable<FuPlayer['burning']>>(); // FIRE_BOOMERANG: set alight this step
  const killedBy = new Map<string, string>(); // victim → the attacker of their first lethal contact
  const deathOf = new Map<string, Death>(); // victim → how they died and who is credited (Slice 8)
  players.forEach((victim, v) => {
    if (!victim.alive) return;
    const sorted = (contacts[v] as Contact[]).sort(
      (x, y) => x.attacker - y.attacker || x.rank - y.rank || x.weapon - y.weapon,
    );
    // ICE_BOOMERANG: an iced contact freezes instead of killing; a shield they wear pops with it (the video, 6:54.52–6:54.55)
    const iced = sorted.filter((c) => c.ice === true);
    const list = sorted.filter((c) => c.ice !== true);
    if (iced.length > 0 && frozenAtStart[v] !== true && !freezing.has(v)) {
      const first = iced[0] as Contact;
      freezing.add(v);
      events.push({
        type: 'FROZEN',
        playerId: victim.id,
        byId: (players[first.attacker] as FuPlayer).id,
        position: positionOf(victim.id),
      });
      if (has(v, 'SHIELD')) {
        inventory[v] = removePower(inventory[v] as Inventory, 'SHIELD');
        events.push({
          type: 'POWER_LOST',
          playerId: victim.id,
          kind: 'SHIELD',
          reason: 'SHIELD_BROKEN',
        });
        events.push({
          type: 'SHIELD_BLOCKED',
          playerId: victim.id,
          byId: (players[first.attacker] as FuPlayer).id,
          position: positionOf(victim.id),
        });
      }
    }
    // FIRE_BOOMERANG: a burn that runs out this step kills, credited to whoever set them alight
    const burn = (state.players[v] as FuPlayer).burning;
    const burnOut = burn !== undefined && burn.seconds - dt <= EPSILON;
    const burnDeath = () => {
      if (burn === undefined) return;
      killedBy.set(victim.id, burn.byId);
      deathOf.set(victim.id, {
        victimId: victim.id,
        creditedTo: burn.creditedTo,
        cause: 'BOOMERANG',
      });
    };
    if (list.length === 0) {
      if (burnOut) burnDeath();
      return;
    }
    if (has(v, 'SHIELD') && !exploding.has(v)) {
      // A guard absorbs exactly ONE lethal contact and is spent; the weapon cannot hit them again this leg/swing.
      const first = list.shift() as Contact;
      inventory[v] = removePower(inventory[v] as Inventory, 'SHIELD'); // the shield breaks: its slot is free
      events.push({
        type: 'POWER_LOST',
        playerId: victim.id,
        kind: 'SHIELD',
        reason: 'SHIELD_BROKEN',
      });
      events.push({
        type: 'SHIELD_BLOCKED',
        playerId: victim.id,
        byId: first.source === 'HAZARD' ? ARENA_ID : (players[first.attacker] as FuPlayer).id,
        position: positionOf(victim.id),
      });
      if (first.source === 'HAZARD') {
        // the shield took the hit; the player is spared by every hazard window they are standing in
        hazardSpared[v] = [...(hazardSpared[v] as number[]), ...(hazardHits[v] as Set<number>)];
      } else if (first.source !== 'SLASH') {
        const w = weapons[first.weapon] as Boomerang;
        weapons[first.weapon] = Object.freeze({ ...w, absorbed: [...w.absorbed, victim.id] });
      } else if (first.source === 'SLASH') {
        const attacker = swings[first.attacker] as FuPlayer;
        if (attacker.slash.phase === 'ACTIVE') {
          swings[first.attacker] = Object.freeze({
            ...attacker,
            slash: Object.freeze({
              ...attacker.slash,
              spared: [...(attacker.slash.spared ?? []), victim.id],
            }),
          });
        }
      }
    }
    // a fire contact sets alight instead of killing at once (fire.ts); any other lethal contact kills as usual
    const killing = list.find((c) => c.fire !== true);
    const firing = list.find((c) => c.fire === true);
    if (killing === undefined && firing !== undefined && burn === undefined && !igniting.has(v)) {
      const byId = (players[firing.attacker] as FuPlayer).id;
      igniting.set(v, {
        seconds: FIRE_BURN_SECONDS,
        byId,
        creditedTo: firing.credit < 0 ? undefined : (players[firing.credit] as FuPlayer).id,
      });
      events.push({ type: 'IGNITED', playerId: victim.id, byId, position: positionOf(victim.id) });
    }
    if (killing === undefined && burnOut) burnDeath();
    if (killing !== undefined) {
      killedBy.set(
        victim.id,
        killing.source === 'HAZARD' ||
          killing.source === 'OUT_OF_BOUNDS' ||
          killing.source === 'FALL'
          ? ARENA_ID
          : (players[killing.attacker] as FuPlayer).id,
      );
      deathOf.set(victim.id, {
        victimId: victim.id,
        creditedTo: killing.credit < 0 ? undefined : (players[killing.credit] as FuPlayer).id,
        cause: killing.source,
      });
    }
  });
  const survivors: FuPlayer[] = swings.map((player) => {
    const byId = killedBy.get(player.id);
    if (byId === undefined) return player;
    const death = deathOf.get(player.id) as Death;
    events.push({
      type: 'HIT',
      byId,
      victimId: player.id,
      position: positionOf(player.id),
      source: death.cause,
      creditedTo: death.creditedTo,
    });
    return Object.freeze({
      ...player,
      alive: false,
      slash: SLASH_READY,
      dash: DASH_READY,
      fatigue: RESTED,
    });
  });

  // 7. Round end ------------------------------------------------------------------------------
  // 6b. The kill race (Slice 8): this step's deaths, in the order of the players, become changes of the meters.
  const scored = applyDeaths(
    state.scores,
    survivors.flatMap((p) => {
      const d = deathOf.get(p.id);
      return d === undefined ? [] : [d];
    }),
  );
  for (const change of scored.changes) events.push({ type: 'SCORE', ...change });
  const winners =
    config.targetKills === undefined
      ? []
      : fullMeters(scored.scores, scored.gained, config.targetKills);
  const matchWonBy = winners.length === 1 ? (winners[0] as string) : undefined;
  if (matchWonBy !== undefined)
    events.push({ type: 'MATCH_WON', winnerId: matchWonBy, kills: scored.scores[matchWonBy] ?? 0 });

  // 7. Round end ------------------------------------------------------------------------------
  // A round ends when one or none is left alive, or — at once — when the match is won (nothing more is processed), or
  // when several fill their meters on this very step (a tie: the round is over and they play a tiebreak next).
  const alive = survivors.filter((p) => p.alive);
  const roundEnds =
    matchWonBy === undefined &&
    ((survivors.length >= 2 && alive.length <= 1) || winners.length > 1);
  const winnerId = alive.length === 1 ? (alive[0] as FuPlayer).id : undefined;
  if (roundEnds) events.push({ type: 'ROUND_OVER', winnerId });
  const concluded = roundEnds || matchWonBy !== undefined; // nothing is live any more: no new Book, no half-finished burst

  // A new pickup appears after everything else (so it cannot be taken the step it appears); the clock
  // only runs while there is room for one and the round is on.
  let pickups: Pickup[] = lying;
  let clock = state.pickupClock;
  const schedule = config.powerups;
  if (schedule !== undefined && !concluded && pickups.length < schedule.maxOnField) {
    const spawnIn = clock.spawnIn - dt;
    if (spawnIn > EPSILON) clock = Object.freeze({ spawnIn, spawned: clock.spawned });
    else {
      const spot = spawnSpot(
        clock.spawned,
        state.round,
        schedule,
        pickups.map((p) => p.position),
        config.spawnSeed ?? config.seed,
      );
      if (spot === undefined)
        clock = Object.freeze({ spawnIn: 0, spawned: clock.spawned }); // wait for a free spot
      else {
        const pickup: Pickup = Object.freeze({
          id: clock.spawned,
          position: spot,
        });
        pickups = [...pickups, pickup];
        clock = Object.freeze({ spawnIn: schedule.intervalSeconds, spawned: clock.spawned + 1 });
        events.push({
          type: 'POWERUP_SPAWNED',
          pickupId: pickup.id,
          position: spot,
        });
      }
    }
  }

  const tFinal = state.roundTime + dt;
  const finalPlayers = survivors.map((p, index) => {
    const base =
      concluded && p.dash.phase !== 'READY' ? Object.freeze({ ...p, dash: DASH_READY }) : p;
    // Ownership outlives death and the end of a round: only a Book, FIFO eviction or a broken shield changes it.
    const owned = inventory[index] as Inventory;
    // a shield's pass lasts only while that hazard is ACTIVE; the dead keep none
    const spared = p.alive
      ? (hazardSpared[index] as number[]).filter(
          (hi) => hazardPhaseAt(hazards[hi] as HazardSpec, tFinal).phase === 'ACTIVE',
        )
      : [];
    const sparedSame =
      spared.length === base.hazardSpared.length &&
      spared.every((v, k) => v === base.hazardSpared[k]);
    const outside = p.alive ? (outsideFor[index] ?? 0) : 0;
    // ICE_BOOMERANG: frozen now, or the ice running down; when it is out the block shatters (THAWED). The dead and a round that
    // is over keep none.
    const left = freezing.has(index) ? ICE_FREEZE_SECONDS : (p.frozen ?? 0) - dt;
    const frozen =
      p.alive && !concluded && (freezing.has(index) || (p.frozen ?? 0) > EPSILON) && left > EPSILON
        ? left
        : undefined;
    if (p.alive && p.frozen !== undefined && frozen === undefined && !concluded)
      events.push({ type: 'THAWED', playerId: p.id, position: positionOf(p.id) });
    const planned = (plans[index] as { nextCharge: ThrowCharge }).nextCharge;
    const charge = p.alive && !concluded ? planned : NO_CHARGE;
    const burning =
      !p.alive || concluded
        ? undefined
        : (igniting.get(index) ??
          (p.burning !== undefined && p.burning.seconds - dt > EPSILON
            ? Object.freeze({ ...p.burning, seconds: p.burning.seconds - dt })
            : undefined));
    const unchanged =
      base.burning === burning &&
      base.inventory === owned &&
      sparedSame &&
      base.outsideFor === outside &&
      base.charge === charge &&
      base.frozen === frozen;
    if (unchanged) return base;
    const { frozen: _was, burning: _burnt, ...rest } = base;
    void _was;
    void _burnt;
    return Object.freeze({
      ...rest,
      inventory: owned,
      hazardSpared: sparedSame ? base.hazardSpared : Object.freeze(spared),
      outsideFor: outside,
      charge,
      ...(burning !== undefined ? { burning } : {}),
      // (frozen mid-dash: the burst ends where they are)
      ...(frozen !== undefined
        ? { frozen, ...(freezing.has(index) ? { dash: DASH_READY } : {}) }
        : {}),
    });
  });

  return {
    state: Object.freeze({
      ...state,
      elapsed: state.elapsed + dt,
      roundTime: tFinal,
      gatesShut: Object.freeze(gatesShut),
      broken: brokenNow.length === state.broken.length ? state.broken : Object.freeze(brokenNow),
      world,
      // A round that has just ended shows no half-finished burst: everyone is READY until the reset.
      players: Object.freeze(finalPlayers),
      boomerangs: Object.freeze(weapons.slice(0, count)),
      // A twin belongs to an owner of EXTRA_BOOMERANG: when they lose the power (FIFO) their second boomerang goes too.
      // A piece of a split (MULTI_BOOMERANG) is gone once caught, dropped or spent; this step's new pieces join the list.
      extraBoomerangs: Object.freeze([
        ...weapons
          .slice(count)
          .filter((b) =>
            b.pieceOf !== undefined
              ? b.state !== 'HELD' && b.state !== 'GROUNDED' && b.state !== 'SPENT'
              : has(ownerOf.get(b.ownerId) as number, 'EXTRA_BOOMERANG'),
          ),
        ...newPieces,
      ]),
      pickups: Object.freeze(pickups),
      pickupClock: clock,
      ...(closingSince !== undefined ? { closingSince } : {}),
      awards,
      phase: matchWonBy !== undefined ? 'MATCH_OVER' : roundEnds ? 'ROUND_OVER' : 'PLAYING',
      roundOver: roundEnds
        ? Object.freeze({
            winnerId,
            resetInSeconds: config.roundEndSeconds,
            awaitingContinue: false,
          })
        : undefined,
      scores: scored.scores,
      matchOver: matchWonBy === undefined ? undefined : Object.freeze({ winnerId: matchWonBy }),
    }),
    events,
  };
}
