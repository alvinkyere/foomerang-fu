import {
  FIXED_TIMESTEP_SECONDS,
  normalizeMovementInput,
  step as stepWorld,
  type InputFrame,
  type MovementInput,
  type Vec2,
} from '@foomerang/game-core';
import { canTransition, transition, type Boomerang } from './boomerang';
import type { FuConfig } from './config';
import { lineIsClear, sweepCircle, wallsOf } from './arena';
import { separateBodies } from './collision';
import { advanceSlash, inSlashRegion, SLASH_READY, startSlash } from './slash';
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
  | { readonly type: 'CAUGHT'; readonly playerId: string }
  | {
      readonly type: 'HIT';
      readonly byId: string;
      readonly victimId: string;
      readonly position: Vec2;
    }
  | { readonly type: 'ROUND_OVER'; readonly winnerId: string | undefined }
  | { readonly type: 'ROUND_START'; readonly round: number };

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

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

function clampToArena(at: Vec2, config: FuConfig): Vec2 {
  const r = config.boomerangRadius;
  return { x: clamp(at.x, r, config.arena.width - r), y: clamp(at.y, r, config.arena.height - r) };
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
 *   1. movement + facing (alive players only; game-core moves the bodies, then living players are
 *      separated from one another — see collision.ts)
 *   2. slash timers advance, then new slashes start (only from READY with the boomerang HELD,
 *      only for the boolean `true`), then throws (only from HELD, and never during an ACTIVE swing —
 *      so when THROW and SLASH arrive on the same step the SLASH wins and the throw is dropped,
 *      whichever order the inputs were delivered in)
 *   3. boomerangs fly (a boomerang thrown this step does not also move this step). A THROWN one
 *      stops at the first wall it would touch and turns RETURNING; a RETURNING one flies straight
 *      home through anything (the one deliberate non-rule about geometry: no pathfinding)
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
    const next = startRound(specs, state.config, state.round + 1, elapsed);
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
}

function stepPlaying(state: FuState, inputs: FuInputs, dt: number): FuStepResult {
  const { config } = state;
  const walls = wallsOf(config.arena);
  const deadZone = state.world.movement.deadZone;
  const events: FuEvent[] = [];

  // 1. Movement and facing -------------------------------------------------------------------
  const frame = new Map<string, MovementInput>();
  const entries = state.players.map((player) => {
    const raw = inputs.get(player.id);
    return isObject(raw) ? (raw as FuPlayerInput) : undefined;
  });
  const moved: FuPlayer[] = state.players.map((player, index) => {
    const move = entries[index]?.move;
    if (!player.alive || !isObject(move)) return player;
    frame.set(
      player.id,
      player.slash.phase === 'READY' ? move : slowedMove(move, deadZone, config.slashMoveFactor), // committed to the swing
    );
    const direction = normalized(normalizeMovementInput(move, deadZone));
    if (direction.x === 0 && direction.y === 0) return player; // not a meaningful direction
    return Object.freeze({ ...player, facing: direction });
  });
  // Move in sub-steps no longer than the fixed step, separating living players after each, so that no
  // supported dt can carry one player through another. (dt = the fixed step is exactly one sub-step.)
  const solid = new Set(state.players.filter((p) => p.alive).map((p) => p.id));
  const subSteps = Math.max(1, Math.ceil(dt / FIXED_TIMESTEP_SECONDS - 1e-9));
  let world = state.world;
  for (let i = 0; i < subSteps; i += 1) {
    world = separateBodies(stepWorld(world, frame, dt / subSteps), (id) => solid.has(id), walls);
  }
  const positionOf = (id: string): Vec2 => {
    const body = world.bodies.find((b) => b.id === id);
    return body === undefined ? ZERO : body.position;
  };

  // HELD boomerangs ride along with their owners.
  let boomerangs: Boomerang[] = state.boomerangs.map((b) =>
    b.state === 'HELD' ? Object.freeze({ ...b, position: positionOf(b.ownerId) }) : b,
  );

  // 2. Slashes, then throws ---------------------------------------------------------------------
  const players: FuPlayer[] = moved.map((player, index) => {
    let slash = player.alive ? advanceSlash(player.slash, dt, config) : SLASH_READY;
    const facing = player.facing;
    if (
      player.alive &&
      entries[index]?.slash === true &&
      slash.phase === 'READY' &&
      (boomerangs[index] as Boomerang).state === 'HELD' &&
      (facing.x !== 0 || facing.y !== 0)
    ) {
      slash = startSlash(facing, config);
      events.push({
        type: 'SLASHED',
        playerId: player.id,
        position: positionOf(player.id),
        direction: facing,
      });
    }
    return slash === player.slash ? player : Object.freeze({ ...player, slash });
  });

  const thrownNow = new Set<string>();
  boomerangs = boomerangs.map((b, index) => {
    const player = players[index] as FuPlayer;
    if (
      !player.alive ||
      entries[index]?.throw !== true ||
      player.slash.phase === 'ACTIVE' || // the weapon is mid-swing; a same-step SLASH always wins
      !canTransition(b.state, 'THROWN')
    )
      return b;
    const facing = player.facing;
    if (facing.x === 0 && facing.y === 0) return b;
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
    thrownNow.add(b.ownerId);
    events.push({ type: 'THROWN', playerId: player.id, position, direction: facing });
    return transition(b, 'THROWN', { position, direction: facing, travelled: 0 });
  });

  // 3. Flight ---------------------------------------------------------------------------------
  const reach = config.playerRadius + config.boomerangRadius;
  const flights: Flight[] = boomerangs.map((b) => {
    if (b.state === 'HELD') return { boomerang: b, lethalAt: undefined, caught: false };
    if (thrownNow.has(b.ownerId)) return { boomerang: b, lethalAt: b.position, caught: false };

    if (b.state === 'THROWN') {
      const length = Math.min(config.throwSpeed * dt, config.throwRange - b.travelled);
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
      if (hitWall || travelled >= config.throwRange - EPSILON) {
        return {
          boomerang: transition(b, 'RETURNING', { position, direction: ZERO, travelled: 0 }),
          lethalAt: position,
          caught: false,
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
    const dx = owner.x - b.position.x;
    const dy = owner.y - b.position.y;
    const distance = Math.hypot(dx, dy);
    const travel = config.returnSpeed * dt;
    const position =
      distance <= travel
        ? owner
        : {
            x: b.position.x + (dx / distance) * travel,
            y: b.position.y + (dy / distance) * travel,
          };
    const arrived = distance - travel <= reach;
    // It can still hurt on the step it arrives, so lethality is judged at `position` before it is caught.
    return {
      boomerang: arrived
        ? transition(b, 'HELD', { position: owner, direction: ZERO, travelled: 0 })
        : Object.freeze({ ...b, position }),
      lethalAt: position,
      caught: arrived,
    };
  });
  boomerangs = flights.map((f) => f.boomerang);
  flights.forEach((f, index) => {
    if (f.caught) events.push({ type: 'CAUGHT', playerId: (players[index] as FuPlayer).id });
  });

  // 4. Hits (simultaneous: everyone alive at the start of the step can be hit) ---------------
  const killedBy = new Map<string, string>(); // victim → first attacker in player order
  flights.forEach((flight, index) => {
    const at = flight.lethalAt;
    const attacker = players[index] as FuPlayer;
    const swing = attacker.slash;
    for (const victim of players) {
      if (!victim.alive || victim.id === attacker.id || killedBy.has(victim.id)) continue;
      const where = positionOf(victim.id);
      const byBoomerang = at !== undefined && distanceSquared(at, where) < reach * reach;
      const from = positionOf(attacker.id);
      const bySlash =
        swing.phase === 'ACTIVE' &&
        inSlashRegion(from, swing.direction, where, config) &&
        lineIsClear(from, where, walls); // a wall is cover: no cutting through it
      if (byBoomerang || bySlash) killedBy.set(victim.id, attacker.id);
    }
  });
  const survivors: FuPlayer[] = players.map((player) => {
    const byId = killedBy.get(player.id);
    if (byId === undefined) return player;
    events.push({ type: 'HIT', byId, victimId: player.id, position: positionOf(player.id) });
    return Object.freeze({ ...player, alive: false, slash: SLASH_READY });
  });

  // 5. Round end ------------------------------------------------------------------------------
  const alive = survivors.filter((p) => p.alive);
  const roundEnds = survivors.length >= 2 && alive.length <= 1;
  const winnerId = alive.length === 1 ? (alive[0] as FuPlayer).id : undefined;
  if (roundEnds) events.push({ type: 'ROUND_OVER', winnerId });

  return {
    state: Object.freeze({
      ...state,
      elapsed: state.elapsed + dt,
      world,
      players: Object.freeze(survivors),
      boomerangs: Object.freeze(boomerangs),
      phase: roundEnds ? 'ROUND_OVER' : 'PLAYING',
      roundOver: roundEnds
        ? Object.freeze({ winnerId, resetInSeconds: config.roundEndSeconds })
        : undefined,
    }),
    events,
  };
}
