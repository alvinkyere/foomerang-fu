import { describe, expect, it } from 'vitest';
import { DEFAULT_DEAD_ZONE } from '../src/input';
import { FIXED_TIMESTEP_SECONDS, MAX_STEP_SECONDS } from '../src/time';
import { createWorld } from '../src/world';
import { ARENA, makeWorld } from './support/worlds';

describe('simulation time constants (seconds)', () => {
  it('fixes the simulation step at 60 Hz', () => {
    expect(FIXED_TIMESTEP_SECONDS).toBe(1 / 60);
  });

  it('caps any single step at 0.1 s (6 fixed steps) so absurd elapsed values are a contract violation', () => {
    expect(MAX_STEP_SECONDS).toBe(0.1);
    expect(MAX_STEP_SECONDS).toBeGreaterThanOrEqual(FIXED_TIMESTEP_SECONDS);
  });
});

describe('createWorld', () => {
  it('builds a frozen world in world units, starting at simulation time 0', () => {
    const world = makeWorld();
    expect(world.time).toBe(0);
    expect(world.arena).toEqual(ARENA);
    expect(world.bodies.map((b) => b.id)).toEqual(['A', 'B', 'C']); // order preserved
    expect(Object.isFrozen(world)).toBe(true);
    expect(Object.isFrozen(world.bodies)).toBe(true);
    expect(Object.isFrozen(world.bodies[0])).toBe(true);
    expect(Object.isFrozen(world.bodies[0]?.position)).toBe(true);
    expect(Object.isFrozen(world.arena)).toBe(true);
    expect(Object.isFrozen(world.movement)).toBe(true);
  });

  it('defaults the dead zone to 0.15 but lets the game configure it', () => {
    expect(makeWorld().movement).toEqual({ maxSpeed: 10, deadZone: DEFAULT_DEAD_ZONE });
    expect(makeWorld(undefined, { maxSpeed: 4, deadZone: 0.3 }).movement).toEqual({
      maxSpeed: 4,
      deadZone: 0.3,
    });
  });

  it('copies its parameters: later mutation of the caller’s objects cannot change the world', () => {
    const arena = { width: 100, height: 60 };
    const spec = { id: 'A', position: { x: 50, y: 30 }, radius: 1 };
    const world = createWorld({ arena, movement: { maxSpeed: 10 }, bodies: [spec] });
    arena.width = 5;
    spec.position.x = 99;
    expect(world.arena.width).toBe(100);
    expect(world.bodies[0]?.position.x).toBe(50);
  });

  it('allows an empty world and bodies resting exactly against the walls', () => {
    expect(makeWorld([]).bodies).toEqual([]);
    expect(() => makeWorld([{ id: 'A', x: 1, y: 1 }])).not.toThrow(); // radius 1 touching top-left
    expect(() => makeWorld([{ id: 'A', x: 99, y: 59 }])).not.toThrow(); // touching bottom-right
  });

  it('allows bodies to start overlapping (no collisions in this slice)', () => {
    expect(() =>
      makeWorld([
        { id: 'A', x: 50, y: 30 },
        { id: 'B', x: 50, y: 30 },
      ]),
    ).not.toThrow();
  });

  const bad = (overrides: Record<string, unknown>) =>
    createWorld({
      arena: ARENA,
      movement: { maxSpeed: 10 },
      bodies: [{ id: 'A', position: { x: 50, y: 30 }, radius: 1 }],
      ...overrides,
    } as never);

  it.each([
    ['zero-width arena', { arena: { width: 0, height: 60 } }],
    ['negative height', { arena: { width: 100, height: -1 } }],
    ['NaN width', { arena: { width: Number.NaN, height: 60 } }],
    ['infinite height', { arena: { width: 100, height: Number.POSITIVE_INFINITY } }],
    ['zero speed', { movement: { maxSpeed: 0 } }],
    ['negative speed', { movement: { maxSpeed: -5 } }],
    ['NaN speed', { movement: { maxSpeed: Number.NaN } }],
    ['dead zone of 1', { movement: { maxSpeed: 10, deadZone: 1 } }],
    ['negative dead zone', { movement: { maxSpeed: 10, deadZone: -0.1 } }],
    ['zero radius', { bodies: [{ id: 'A', position: { x: 50, y: 30 }, radius: 0 }] }],
    ['negative radius', { bodies: [{ id: 'A', position: { x: 50, y: 30 }, radius: -1 }] }],
    ['NaN radius', { bodies: [{ id: 'A', position: { x: 50, y: 30 }, radius: Number.NaN }] }],
    ['empty id', { bodies: [{ id: '', position: { x: 50, y: 30 }, radius: 1 }] }],
    ['NaN position', { bodies: [{ id: 'A', position: { x: Number.NaN, y: 30 }, radius: 1 }] }],
    [
      'body too wide for the arena',
      { bodies: [{ id: 'A', position: { x: 50, y: 30 }, radius: 31 }] },
    ],
    [
      'body starting outside the arena',
      { bodies: [{ id: 'A', position: { x: 150, y: 30 }, radius: 1 }] },
    ],
    [
      'body overlapping the wall',
      { bodies: [{ id: 'A', position: { x: 0.5, y: 30 }, radius: 1 }] },
    ],
    [
      'duplicate ids',
      {
        bodies: [
          { id: 'A', position: { x: 10, y: 10 }, radius: 1 },
          { id: 'A', position: { x: 20, y: 20 }, radius: 1 },
        ],
      },
    ],
  ])('rejects %s as a programming error', (_label, overrides) => {
    expect(() => bad(overrides)).toThrow(RangeError);
  });
});
