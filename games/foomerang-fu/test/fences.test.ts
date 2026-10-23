import { describe, expect, it } from 'vitest';
import { distanceToSolid, stepFu, type FuArena, type FuState } from '../src/rules';
import { DT, R, at, boom, face, input, make, place, run, STRAIGHT } from './support/fixtures';

// Fences (owner, 2026-10-23: the gong islands' bridges "3D with actual barriers"): low barriers, the bridges' rope rails.
// A fence is solid to a body, as a wall is, but a boomerang flies over it and a slash reaches across it. The CPUs walk round
// fences as round walls, and nobody starts a round inside one.

const RAIL = { shape: 'box', x: 800, y: 450, halfWidth: 18, halfHeight: 200, angle: 0 } as const;
const ARENA: FuArena = {
  width: 1600,
  height: 900,
  fences: [RAIL],
  spawns: [
    { x: 400, y: 450 },
    { x: 1300, y: 200 },
    { x: 200, y: 150 },
    { x: 200, y: 750 },
    { x: 1400, y: 450 },
    { x: 1400, y: 750 },
  ],
};
const match = (): FuState => make(['a', 'b'], { ...STRAIGHT, arena: ARENA, seed: 4 });

describe('fences', () => {
  it('a player walking into a fence is stopped by it, never through it', () => {
    let s = place(match(), 'a', 650, 450);
    for (let i = 0; i < 90; i += 1) {
      s = stepFu(s, input({ a: { move: { x: 1, y: 0 } } }), DT).state;
      expect(distanceToSolid(at(s, 'a'), RAIL), `step ${i}`).toBeGreaterThan(R - 0.5);
    }
    expect(at(s, 'a').x).toBeLessThan(800);
  });

  it('a thrown boomerang flies straight over it', () => {
    let s = place(match(), 'a', 650, 450);
    s = face(s, 'a', 1, 0);
    const r = run(s, 20, input({ a: { throw: true } }));
    expect(boom(r.state, 'a').state).toBe('THROWN'); // not turned back
    expect(boom(r.state, 'a').position.x).toBeGreaterThan(830);
  });

  it('a slash reaches a player on its other side', () => {
    let s = place(match(), 'a', 760, 450);
    s = place(s, 'b', 845, 450);
    s = face(s, 'a', 1, 0);
    const r = run(s, 20, input({ a: { slash: true } }));
    expect(r.state.players.find((p) => p.id === 'b')?.alive).toBe(false);
  });

  it('a spawn inside a fence is refused', () => {
    expect(() =>
      make(['a', 'b'], {
        arena: { ...ARENA, spawns: [{ x: 800, y: 450 }, ...(ARENA.spawns ?? []).slice(1)] },
      }),
    ).toThrow();
  });
});
