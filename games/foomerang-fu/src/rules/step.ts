import {
  FIXED_TIMESTEP_SECONDS,
  normalizeMovementInput,
  step as stepWorld,
  type InputFrame,
  type MovementInput,
  type Vec2,
} from '@foomerang/game-core';
import { transition, type Boomerang } from './boomerang';
import type { FuConfig } from './config';
import {
  circleHitsWalls,
  lineClearTo,
  lineIsClear,
  sweepCircle,
  wallsOf,
  type Rect,
} from './arena';
import { deflectionDirection } from './deflect';
import { homeStep } from './homing';
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
import { lastValidAlong, planPhaseDash } from './phase';
import { startRound, type FuPlayer, type FuState } from './state';
import { distanceSquared, normalized, ZERO } from './vec';

/** One player's input for one step. Everything is optional and everything is untrusted. */
export interface FuPlayerInput {
  /** Latest thumb position, as the platform delivers it. */
  readonly move?: MovementInput;
  /** A throw was requested since the last step. Only the boolean `true` counts. */
  readonly throw?: boolean;
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
      /** Slice 5: present (true) for a dash by a holder of PHASE_DASH that may cross walls. */
      readonly phasing?: true;
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
  /** Slice 5: an armed boomerang exploded at `position`; `victims` were inside the blast with a clear line (before any guard). */
  | {
      readonly type: 'BLASTED';
      readonly ownerId: string;
      readonly position: Vec2;
      readonly radius: number;
      readonly victims: readonly string[];
    }
  /** Slice 5: a GUARD absorbed `byId`'s lethal contact and is spent. */
  | {
      readonly type: 'GUARD_BLOCKED';
      readonly playerId: string;
      readonly byId: string;
      readonly position: Vec2;
    }
  /** Slice 5: a Phase Dash body started / stopped overlapping a wall. */
  | { readonly type: 'PHASE_ENTERED'; readonly playerId: string; readonly position: Vec2 }
  | { readonly type: 'PHASE_EXITED'; readonly playerId: string; readonly position: Vec2 }
  /** Slice 4: this player's dash count passed `dashFreeCount`; they are FATIGUED until they recover. */
  | { readonly type: 'FATIGUED'; readonly playerId: string }
  /** Slice 4: a FATIGUED player's recovery completed; full mobility is back and the dash count is reset. */
  | { readonly type: 'RECOVERED'; readonly playerId: string }
  | { readonly type: 'CAUGHT'; readonly playerId: string }
  /** Slice 3: an active slash knocked an enemy boomerang off course. `direction` is where it is now flying. */
  | {
      readonly type: 'DEFLECTED';
      readonly byId: string;
      readonly ownerId: string;
      readonly position: Vec2;
      readonly direction: Vec2;
    }
  /** The failsafe: a boomerang that could not get home round the walls in time ended up back in its owner's hand. */
  | { readonly type: 'RECALLED'; readonly playerId: string }
  | {
      readonly type: 'HIT';
      readonly byId: string;
      readonly victimId: string;
      readonly position: Vec2;
    }
  | { readonly type: 'ROUND_OVER'; readonly winnerId: string | undefined }
  | { readonly type: 'ROUND_START'; readonly round: number }
  /** Slice 5: the last round of a match ended; inventories are cleared as the next match starts. */
  | { readonly type: 'MATCH_OVER' };

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
  /** Dashers whose burst ends now: a living player stopped them, or a Phase Dash reached its planned end. */
  readonly ends: ReadonlySet<string>;
  /** Phase dashers: how far they have now gone, and whether they now overlap a wall. */
  readonly progress: ReadonlyMap<string, { readonly travelled: number; readonly inside: boolean }>;
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
  config: FuConfig,
  walls: readonly Rect[],
): Carried {
  const ends = new Set<string>();
  const progress = new Map<string, { travelled: number; inside: boolean }>();
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
    const run = dash.phasing;
    let travel = run === undefined ? intended : Math.min(intended, run.limit - run.travelled);
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
    if (run === undefined) {
      if (blocked) ends.add(player.id);
      return;
    }
    const travelled = run.travelled + travel;
    progress.set(player.id, { travelled, inside: circleHitsWalls(at, body.radius, walls) });
    if (blocked || travelled >= run.limit - 1e-9) ends.add(player.id);
  });
  return { world: moveBodies(world, arrivals), ends, progress };
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

  if (state.phase === 'ROUND_OVER') return stepRoundOver(state, probe, dt);
  return stepPlaying(state, inputs, dt);
}

function stepRoundOver(state: FuState, world: FuState['world'], dt: number): FuStepResult {
  const over = state.roundOver;
  const remaining = (over?.resetInSeconds ?? 0) - dt;
  const elapsed = state.elapsed + dt;
  if (remaining <= EPSILON) {
    const specs = state.players.map((p) => ({ id: p.id, slot: p.slot }));
    const { matchRounds } = state.config;
    if (matchRounds !== undefined && state.round >= matchRounds) {
      // The match is over: every inventory is cleared and a new match begins at round 1.
      const next = startRound(specs, state.config, 1, elapsed);
      return {
        state: next,
        events: [{ type: 'MATCH_OVER' }, { type: 'ROUND_START', round: next.round }],
      };
    }
    // A normal round reset keeps what each player owns (and the match's count of Books taken).
    const carried = new Map(state.players.map((p) => [p.id, p.inventory]));
    const next = startRound(specs, state.config, state.round + 1, elapsed, carried, state.awards);
    return { state: next, events: [{ type: 'ROUND_START', round: next.round }] };
  }
  return {
    state: Object.freeze({
      ...state,
      elapsed,
      world,
      roundOver: Object.freeze({ winnerId: over?.winnerId, resetInSeconds: remaining }),
    }),
    events: [],
  };
}

interface Flight {
  readonly boomerang: Boomerang;
  /** Where it can hit someone this step, or undefined if it is not lethal this step. */
  readonly lethalAt: Vec2 | undefined;
  readonly caught: boolean;
  /** Returned to the owner's hand by the wall-following failsafe rather than caught. */
  readonly recalled?: boolean;
  /** THROWN/DEFLECTED and it stopped against a wall or the arena edge this step (not merely at the end of its range). */
  readonly wallImpact?: boolean;
}

/** Where a lethal contact came from, in the order a guard absorbs them. */
interface Contact {
  readonly attacker: number;
  readonly rank: number; // 0 boomerang / blast, 1 slash
  readonly weapon: number; // index into the weapon list, -1 for a slash
  readonly source: 'BOOMERANG' | 'BLAST' | 'SLASH';
}

const EMPTY: readonly string[] = Object.freeze([]);
/** A pickup is taken within this of the body when the config has no schedule of its own (hand-placed pickups). */
const DEFAULT_PICKUP_RADIUS = 28;

function stepPlaying(state: FuState, inputs: FuInputs, dt: number): FuStepResult {
  const { config } = state;
  const walls = wallsOf(config.arena);
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
  // What each player OWNS (oldest first). Changes only by a Book, FIFO eviction or a shield breaking.
  const inventory: Inventory[] = state.players.map((p) => p.inventory);
  const has = (index: number, kind: PowerKind): boolean =>
    (inventory[index] as Inventory).includes(kind);
  const overdriven = state.players.map((p, index) => p.alive && has(index, 'OVERDRIVE'));
  // Every boomerang in one list: each player's own (same order as the players), then the twins. A twin
  // whose owner is not in the match is an impossible state and is dropped, never obeyed.
  const startExtras = state.extraBoomerangs.filter((b) => ownerOf.has(b.ownerId));
  const startWeapons = [...state.boomerangs, ...startExtras];
  const heldAny = state.players.map((p) =>
    startWeapons.some((w) => w.ownerId === p.id && w.state === 'HELD'),
  );

  // 1a. Facing. A dashing player is committed: the thumb neither steers nor turns them.
  const moved: FuPlayer[] = state.players.map((player, index) => {
    const move = entries[index]?.move;
    if (!player.alive || dashingAtStart[index] === true || !isObject(move)) return player;
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
    const committed = dashingAtStart[index] === true; // mid-dash: no slash, throw or new dash
    const hasFacing = player.facing.x !== 0 || player.facing.y !== 0;
    const held = heldAny[index] === true; // at least one boomerang in hand
    const slashes =
      player.alive &&
      !committed &&
      entry?.slash === true &&
      (slashAfter[index] as SlashState).phase === 'READY' &&
      held &&
      hasFacing;
    const throws =
      player.alive &&
      !committed &&
      entry?.throw === true &&
      !slashes && // a same-step SLASH always wins
      (slashAfter[index] as SlashState).phase !== 'ACTIVE' && // the weapon is mid-swing
      held &&
      hasFacing;
    const dashes =
      player.alive &&
      !committed &&
      entry?.dash === true &&
      !slashes &&
      !throws &&
      (slashAfter[index] as SlashState).phase === 'READY'; // not while swinging or recovering
    return { slashes, throws, dashes };
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
      // A holder of PHASE_DASH, starting from valid (non-wall) space, dashes along a planned straight line.
      let plan: { origin: Vec2; limit: number } | undefined;
      if (has(index, 'PHASE_DASH') && !circleHitsWalls(origin, R, walls)) {
        const speed =
          config.dashSpeed *
          (tired ? config.fatiguedDashFactor : 1) *
          (boostedDash ? config.overdriveDashFactor : 1);
        const limit = planPhaseDash(
          origin,
          direction,
          speed * config.dashSeconds,
          R,
          walls,
          config.arena,
          state.world.bodies.filter(
            (b) => b.id !== player.id && state.players.some((p) => p.id === b.id && p.alive),
          ),
        );
        plan = { origin, limit };
      }
      events.push({
        type: 'DASHED',
        playerId: player.id,
        position: origin,
        direction,
        ...(plan === undefined ? {} : { phasing: true }),
      });
      return startDash(direction, config, tired, boostedDash, plan);
    }
    return state.players[index]?.alive ? (player.dash as DashState) : DASH_READY;
  });
  moved.forEach((player, index) => {
    const move = entries[index]?.move;
    if (!player.alive || (dashes[index] as DashState).phase === 'DASHING' || !isObject(move))
      return;
    // Slowed while committed to a swing and while fatigued, sped up under OVERDRIVE (they multiply).
    const factor =
      (player.slash.phase === 'READY' ? 1 : config.slashMoveFactor) *
      (isFatigued(fatigue[index] as Fatigue, config) ? config.fatiguedMoveFactor : 1) *
      (overdriven[index] === true ? config.overdriveMoveFactor : 1);
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
  const settle = (index: number, ended: DashState): void => {
    // A Phase Dash that ends must end in valid space: back to the last valid place on its line if need be.
    if (ended.phase !== 'DASHING' || ended.phasing === undefined) return;
    const player = state.players[index] as FuPlayer;
    const body = world.bodies.find((b) => b.id === player.id);
    if (body === undefined) return;
    const run = ended.phasing;
    const t = lastValidAlong(run.origin, ended.direction, run.travelled, R, walls);
    const to = {
      x: run.origin.x + ended.direction.x * t,
      y: run.origin.y + ended.direction.y * t,
    };
    if (to.x !== body.position.x || to.y !== body.position.y) {
      world = moveBodies(world, new Map([[player.id, to]]));
    }
    if (run.inside) events.push({ type: 'PHASE_EXITED', playerId: player.id, position: to });
  };
  for (let i = 0; i < subSteps; i += 1) {
    world = stepWorld(world, frame, h);
    const carried = carryBodies(world, state.players, dashes, boosted, solid, h, config, walls);
    world = carried.world;
    for (let j = 0; j < dashes.length; j += 1) {
      let dash = dashes[j] as DashState;
      if (dash.phase !== 'DASHING') continue;
      const id = (state.players[j] as FuPlayer).id;
      const seen = carried.progress.get(id);
      if (seen !== undefined && dash.phasing !== undefined) {
        const position = world.bodies.find((b) => b.id === id)?.position ?? ZERO;
        if (seen.inside && !dash.phasing.inside) {
          // entering a wall is announced (owning PHASE_DASH costs nothing: no charges)
          events.push({ type: 'PHASE_ENTERED', playerId: id, position });
        } else if (!seen.inside && dash.phasing.inside) {
          events.push({ type: 'PHASE_EXITED', playerId: id, position });
        }
        dash = Object.freeze({
          ...dash,
          phasing: Object.freeze({
            ...dash.phasing,
            travelled: seen.travelled,
            inside: seen.inside,
          }),
        });
      }
      const next = advanceDashing(dash, h, carried.ends.has(id));
      if (next.phase === 'READY') settle(j, dash);
      dashes[j] = next;
    }
    const phasingNow = new Set(
      dashes.flatMap((d, j) =>
        d.phase === 'DASHING' && d.phasing !== undefined ? [(state.players[j] as FuPlayer).id] : [],
      ),
    );
    world = separateBodies(world, (id) => solid.has(id), walls, phasingNow);
  }
  const positionOf = (id: string): Vec2 => {
    const body = world.bodies.find((b) => b.id === id);
    return body === undefined ? ZERO : body.position;
  };

  // 2. Pickups are collected on the end-of-movement positions, before anything is thrown or hit ---
  // Pickups are visited in id order; each goes to the NEAREST eligible player (a tie goes to the earlier
  // player in the match); a player takes at most one per step. A pickup is out of reach behind a wall.
  const reachSquared = (R + (config.powerups?.pickupRadius ?? DEFAULT_PICKUP_RADIUS)) ** 2;
  const took = new Set<number>();
  const newTwins: Boomerang[] = [];
  const lying: Pickup[] = [];
  let awards = state.awards;
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
    const given = awardPower(inventory[best] as Inventory, kind);
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
    if (kind === 'TWIN_THROW') {
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

  // One THROW press throws ONE boomerang: the player's own first, then the twin.
  const thrownNow = new Set<number>();
  state.players.forEach((_p, index) => {
    if (!(plans[index] as { throws: boolean }).throws) return;
    const k = weapons.findIndex((w, i) => ownerIdx[i] === index && w.state === 'HELD');
    if (k < 0) return;
    const b = weapons[k] as Boomerang;
    const player = players[index] as FuPlayer;
    const facing = player.facing;
    const gap = config.playerRadius + config.boomerangRadius + 1; // starts just outside its owner
    const owner = positionOf(player.id);
    // Pressed against a wall, the boomerang starts as close to the owner as the wall allows; it then
    // meets the wall on its first step and turns straight back.
    const position = sweepCircle(
      owner,
      clampToArena({ x: owner.x + facing.x * gap, y: owner.y + facing.y * gap }, config),
      config.boomerangRadius,
      walls,
    ).position;
    thrownNow.add(k);
    // An owner of BLAST_BOOMERANG arms every boomerang they throw (each can detonate once per throw).
    const arm = has(index, 'BLAST_BOOMERANG');
    events.push({ type: 'THROWN', playerId: player.id, position, direction: facing });
    weapons[k] = transition(b, 'THROWN', { position, direction: facing, travelled: 0, blast: arm });
  });

  // 4. Flight ---------------------------------------------------------------------------------
  const reach = config.playerRadius + config.boomerangRadius;
  const flights: Flight[] = weapons.map((b, k) => {
    if (b.state === 'HELD') return { boomerang: b, lethalAt: undefined, caught: false };
    if (thrownNow.has(k)) return { boomerang: b, lethalAt: b.position, caught: false };

    if (b.state === 'THROWN' || b.state === 'DEFLECTED') {
      // A deflected boomerang flies just like a thrown one — straight, at throw speed, stopped by walls —
      // but only for `deflectRange`, after which it turns RETURNING and goes home the usual way.
      const range = b.state === 'DEFLECTED' ? config.deflectRange : config.throwRange;
      const length = Math.min(config.throwSpeed * dt, range - b.travelled);
      const free = {
        x: b.position.x + b.direction.x * length,
        y: b.position.y + b.direction.y * length,
      };
      const bounded = clampToArena(free, config);
      // Solid geometry stops it where it would touch: no penetration, no bounce, no tunnelling.
      const swept = sweepCircle(b.position, bounded, config.boomerangRadius, walls);
      const position = swept.position;
      const hitWall = swept.blocked || bounded.x !== free.x || bounded.y !== free.y;
      const travelled = b.travelled + length;
      if (hitWall || travelled >= range - EPSILON) {
        return {
          boomerang: transition(b, 'RETURNING', {
            position,
            direction: ZERO,
            travelled: 0,
            follow: 0,
            wallSeconds: 0,
            deflectedBy: undefined,
            absorbed: EMPTY,
          }),
          lethalAt: position,
          caught: false,
          wallImpact: hitWall,
        };
      }
      return {
        boomerang: Object.freeze({ ...b, position, travelled }),
        lethalAt: position,
        caught: false,
      };
    }

    // RETURNING: home in on the owner's CURRENT position.
    const owner = positionOf(b.ownerId);
    const travel = config.returnSpeed * dt;
    const home = (position: Vec2, arrived: boolean, extra: Partial<typeof b>, recalled = false) =>
      ({
        // It can still hurt on the step it arrives, so lethality is judged at `position` before it is caught.
        boomerang: arrived
          ? transition(b, 'HELD', {
              position: owner,
              direction: ZERO,
              travelled: 0,
              follow: 0,
              wallSeconds: 0,
              deflections: 0,
              deflectedBy: undefined,
              absorbed: EMPTY,
            })
          : Object.freeze({ ...b, position, ...extra }),
        lethalAt: position,
        caught: arrived,
        recalled,
      }) satisfies Flight;

    if (walls.length === 0) {
      // Open ground (Slice 1 exactly): a straight line home.
      const dx = owner.x - b.position.x;
      const dy = owner.y - b.position.y;
      const distance = Math.hypot(dx, dy);
      const position =
        distance <= travel
          ? owner
          : {
              x: b.position.x + (dx / distance) * travel,
              y: b.position.y + (dy / distance) * travel,
            };
      return home(position, distance - travel <= reach, {});
    }

    // Among walls: still home on the owner, but bound by the geometry — local steering, see homing.ts.
    const homed = homeStep(
      b.position,
      owner,
      travel,
      config.boomerangRadius,
      walls,
      config.arena,
      b.follow,
    );
    const wallSeconds = b.wallSeconds + (homed.followed ? dt : 0);
    const arrived = Math.hypot(owner.x - homed.position.x, owner.y - homed.position.y) <= reach;
    // The failsafe: sliding along walls for too long without getting home ends the trip, deterministically.
    const recalled = !arrived && wallSeconds >= config.returnWallSeconds - EPSILON;
    return home(
      homed.position,
      arrived || recalled,
      { follow: homed.follow, wallSeconds },
      recalled,
    );
  });
  const flownFrom = weapons; // where each boomerang was before it flew this step
  weapons = flights.map((f) => f.boomerang);
  flights.forEach((f, k) => {
    if (!f.caught) return;
    const owner = ownerIdx[k] as number;
    events.push({
      type: f.recalled === true ? 'RECALLED' : 'CAUGHT',
      playerId: (players[owner] as FuPlayer).id,
    });
    // home again: whatever armed this throw is spent; the NEXT throw is armed afresh while BLAST is owned
    weapons[k] = Object.freeze({ ...(weapons[k] as Boomerang), blast: false });
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
    if (b.state === 'HELD' || b.deflections >= config.maxDeflections) return;
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
  // then boomerangs/blasts before the slash, then the weapon); then a GUARD takes the FIRST one and the
  // rest kill. An armed boomerang's first contact (or wall impact) is an explosion instead: everyone
  // (not its owner, not whoever just deflected it) within `blastRadius` with a clear line is a victim.
  const contacts: Contact[][] = players.map(() => []);
  const blastRadiusSquared = config.blastRadius * config.blastRadius;
  weapons.forEach((w, k) => {
    const at = lethalAt[k];
    if (at === undefined) return;
    const a = ownerIdx[k] as number;
    const immuneTo = (victim: FuPlayer): boolean =>
      (w.state === 'DEFLECTED' && w.deflectedBy === victim.id) || w.absorbed.includes(victim.id);
    const touched: number[] = [];
    players.forEach((victim, v) => {
      if (v === a || !victim.alive || immuneTo(victim)) return;
      if (distanceSquared(at, positionOf(victim.id)) < reach * reach) touched.push(v);
    });
    if (w.blast && (touched.length > 0 || flights[k]?.wallImpact === true)) {
      const hit = new Set(touched);
      players.forEach((victim, v) => {
        if (v === a || !victim.alive || immuneTo(victim)) return;
        const where = positionOf(victim.id);
        if (distanceSquared(at, where) < blastRadiusSquared && lineClearTo(at, where, R, walls))
          hit.add(v);
      });
      const ordered = [...hit].sort((x, y) => x - y);
      for (const v of ordered)
        contacts[v]?.push({ attacker: a, rank: 0, weapon: k, source: 'BLAST' });
      weapons[k] = Object.freeze({ ...w, blast: false }); // spent: it flies on as a plain boomerang
      events.push({
        type: 'BLASTED',
        ownerId: w.ownerId,
        position: at,
        radius: config.blastRadius,
        victims: ordered.map((v) => (players[v] as FuPlayer).id),
      });
    } else {
      for (const v of touched)
        contacts[v]?.push({ attacker: a, rank: 0, weapon: k, source: 'BOOMERANG' });
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
        contacts[v]?.push({ attacker: a, rank: 1, weapon: -1, source: 'SLASH' }); // a wall is cover: no cutting through it
      }
    });
  });
  const killedBy = new Map<string, string>(); // victim → the attacker of their first lethal contact
  players.forEach((victim, v) => {
    if (!victim.alive) return;
    const list = (contacts[v] as Contact[]).sort(
      (x, y) => x.attacker - y.attacker || x.rank - y.rank || x.weapon - y.weapon,
    );
    if (list.length === 0) return;
    if (has(v, 'GUARD')) {
      // A guard absorbs exactly ONE lethal contact and is spent; the weapon cannot hit them again this leg/swing.
      const first = list.shift() as Contact;
      inventory[v] = removePower(inventory[v] as Inventory, 'GUARD'); // the shield breaks: its slot is free
      events.push({
        type: 'POWER_LOST',
        playerId: victim.id,
        kind: 'GUARD',
        reason: 'SHIELD_BROKEN',
      });
      events.push({
        type: 'GUARD_BLOCKED',
        playerId: victim.id,
        byId: (players[first.attacker] as FuPlayer).id,
        position: positionOf(victim.id),
      });
      if (first.source !== 'SLASH') {
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
    const [killing] = list;
    if (killing !== undefined) killedBy.set(victim.id, (players[killing.attacker] as FuPlayer).id);
  });
  const survivors: FuPlayer[] = swings.map((player) => {
    const byId = killedBy.get(player.id);
    if (byId === undefined) return player;
    events.push({ type: 'HIT', byId, victimId: player.id, position: positionOf(player.id) });
    return Object.freeze({
      ...player,
      alive: false,
      slash: SLASH_READY,
      dash: DASH_READY,
      fatigue: RESTED,
    });
  });

  // 7. Round end ------------------------------------------------------------------------------
  const alive = survivors.filter((p) => p.alive);
  const roundEnds = survivors.length >= 2 && alive.length <= 1;
  const winnerId = alive.length === 1 ? (alive[0] as FuPlayer).id : undefined;
  if (roundEnds) events.push({ type: 'ROUND_OVER', winnerId });

  // A new pickup appears after everything else (so it cannot be taken the step it appears); the clock
  // only runs while there is room for one and the round is on.
  let pickups: Pickup[] = lying;
  let clock = state.pickupClock;
  const schedule = config.powerups;
  if (schedule !== undefined && !roundEnds && pickups.length < schedule.maxOnField) {
    const spawnIn = clock.spawnIn - dt;
    if (spawnIn > EPSILON) clock = Object.freeze({ spawnIn, spawned: clock.spawned });
    else {
      const spot = spawnSpot(
        clock.spawned,
        state.round,
        schedule,
        pickups.map((p) => p.position),
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

  const finalPlayers = survivors.map((p, index) => {
    const base =
      roundEnds && p.dash.phase !== 'READY' ? Object.freeze({ ...p, dash: DASH_READY }) : p;
    // Ownership outlives death and the end of a round: only a Book, FIFO eviction or a broken shield changes it.
    const owned = inventory[index] as Inventory;
    return base.inventory === owned ? base : Object.freeze({ ...base, inventory: owned });
  });

  return {
    state: Object.freeze({
      ...state,
      elapsed: state.elapsed + dt,
      world,
      // A round that has just ended shows no half-finished burst: everyone is READY until the reset.
      players: Object.freeze(finalPlayers),
      boomerangs: Object.freeze(weapons.slice(0, count)),
      // A twin belongs to an owner of TWIN_THROW: when they lose the power (FIFO) their second boomerang goes too.
      extraBoomerangs: Object.freeze(
        weapons.slice(count).filter((b) => has(ownerOf.get(b.ownerId) as number, 'TWIN_THROW')),
      ),
      pickups: Object.freeze(pickups),
      pickupClock: clock,
      awards,
      phase: roundEnds ? 'ROUND_OVER' : 'PLAYING',
      roundOver: roundEnds
        ? Object.freeze({ winnerId, resetInSeconds: config.roundEndSeconds })
        : undefined,
    }),
    events,
  };
}
