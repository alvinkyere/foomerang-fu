import { DEFAULT_DEAD_ZONE, assertValidDeadZone, type MovementInput } from './input';
import type { Vec2 } from './vec2';

/**
 * Units: positions, sizes and arena dimensions are WORLD UNITS; speeds are world units per
 * second; time is seconds. Nothing here knows about pixels, frames, DOM or devices — rendering
 * decides how world units map to a screen.
 *
 * Ids are plain strings so this package depends on nothing: a branded PlayerId from room-engine
 * is assignable to it, and the caller keeps its own type safety.
 */
export type EntityId = string;

/** A rectangle from (0, 0) to (width, height). */
export interface Arena {
  readonly width: number;
  readonly height: number;
}

/** A circle that moves. `position` is its CENTER. */
export interface Body {
  readonly id: EntityId;
  readonly position: Vec2;
  readonly radius: number;
}

export interface MovementConfig {
  /** World units per second at full deflection. Chosen by the game, so there is no default. */
  readonly maxSpeed: number;
  /** Radial dead zone in [0, 1). */
  readonly deadZone: number;
}

/**
 * The COMPLETE simulation state: plain, serializable data with no hidden fields, so a snapshot
 * is a valid restart/replay point. The rules it runs under (arena, movement) travel with it.
 */
export interface WorldState {
  /** Simulation seconds elapsed. Advances only by `dt`. */
  readonly time: number;
  readonly arena: Arena;
  readonly movement: MovementConfig;
  /** Order is stable and preserved by `step`. */
  readonly bodies: readonly Body[];
}

/**
 * One tick's input, keyed by id — never by position in an array. An id absent from the frame
 * means ZERO movement for that body this step: the simulation never repeats an earlier input.
 * (Whether the network layer wants “latest state wins” is that layer’s decision.)
 */
export type InputFrame = ReadonlyMap<EntityId, MovementInput>;

export interface WorldParams {
  readonly arena: Arena;
  readonly movement: { readonly maxSpeed: number; readonly deadZone?: number };
  readonly bodies: readonly {
    readonly id: EntityId;
    readonly position: Vec2;
    readonly radius: number;
  }[];
}

const positive = (value: number) => Number.isFinite(value) && value > 0;

/** Builds a frozen, validated world at time 0. Invalid parameters are programming errors (RangeError). */
export function createWorld(params: WorldParams): WorldState {
  const { arena, movement } = params;
  if (!positive(arena.width) || !positive(arena.height)) {
    throw new RangeError('arena width and height must be positive, finite world units');
  }
  if (!positive(movement.maxSpeed)) {
    throw new RangeError('maxSpeed must be a positive, finite number of world units per second');
  }
  const deadZone = movement.deadZone ?? DEFAULT_DEAD_ZONE;
  assertValidDeadZone(deadZone);

  const seen = new Set<EntityId>();
  const bodies = params.bodies.map((spec): Body => {
    if (spec.id.length === 0) throw new RangeError('a body id must not be empty');
    if (seen.has(spec.id)) throw new RangeError(`duplicate body id: ${spec.id}`);
    seen.add(spec.id);
    if (!positive(spec.radius))
      throw new RangeError(`body ${spec.id}: radius must be positive and finite`);
    const { x, y } = spec.position;
    const inside =
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x >= spec.radius &&
      x <= arena.width - spec.radius &&
      y >= spec.radius &&
      y <= arena.height - spec.radius;
    if (!inside) {
      throw new RangeError(`body ${spec.id}: circle must lie entirely inside the arena`);
    }
    return Object.freeze({ id: spec.id, position: Object.freeze({ x, y }), radius: spec.radius });
  });

  return Object.freeze({
    time: 0,
    arena: Object.freeze({ width: arena.width, height: arena.height }),
    movement: Object.freeze({ maxSpeed: movement.maxSpeed, deadZone }),
    bodies: Object.freeze(bodies),
  });
}
