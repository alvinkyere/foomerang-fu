import { describe, expect, it } from 'vitest';
import { DEFAULT_FU_CONFIG, createFuMatch, stepFu, type FuArena, type FuState } from '../src/rules';
import { DT, NONE, at, input, player, types } from './support/fixtures';

// The plaza's border (owner, 2026-10-17): players may cross the dashed lines, but a player who stays outside the safe zone
// for `outsideLimitSeconds` (5 s) explodes: an environment death (nobody credited, the victim loses a kill), which no shield
// can stop. The timer counts CONTINUOUS time outside: stepping back in resets it.

const ARENA: FuArena = Object.freeze({
  width: 1600,
  height: 900,
  safeZone: Object.freeze({ x: 200, y: 0, width: 1200, height: 900 }),
  spawns: Object.freeze([
    Object.freeze({ x: 800, y: 450 }),
    Object.freeze({ x: 1000, y: 450 }),
    Object.freeze({ x: 600, y: 300 }),
    Object.freeze({ x: 600, y: 600 }),
    Object.freeze({ x: 1000, y: 300 }),
    Object.freeze({ x: 1000, y: 600 }),
  ]),
});

const match = (): FuState =>
  createFuMatch(
    [
      { id: 'a', slot: 0 },
      { id: 'b', slot: 1 },
    ],
    { arena: ARENA, seed: 3 },
  );

/** `a` placed at (x, y), everything else as created. */
function put(s: FuState, x: number, y = 450): FuState {
  return {
    ...s,
    world: {
      ...s.world,
      bodies: s.world.bodies.map((b) => (b.id === 'a' ? { ...b, position: { x, y } } : b)),
    },
  };
}

function run(s: FuState, seconds: number, inputs = NONE) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    const r = stepFu(s, inputs, DT);
    s = r.state;
    events.push(...r.events);
  }
  return { s, events };
}

describe('outside the dashed lines', () => {
  it('the default limit is 5 seconds', () => {
    expect(DEFAULT_FU_CONFIG.outsideLimitSeconds).toBe(5);
  });

  it('inside the safe zone the timer stays at 0', () => {
    const { s } = run(put(match(), 800), 2);
    expect(player(s, 'a').outsideFor).toBe(0);
    expect(player(s, 'a').alive).toBe(true);
  });

  it('outside it counts up; 0.1 s short of the limit the player is still alive', () => {
    const { s } = run(put(match(), 100), 4.9);
    expect(player(s, 'a').outsideFor).toBeCloseTo(4.9, 6);
    expect(player(s, 'a').alive).toBe(true);
  });

  it('at the limit the player explodes: an environment death, nobody credited', () => {
    const { s, events } = run(put(match(), 100), 5.01);
    expect(player(s, 'a').alive).toBe(false);
    const hit = events.find((e) => e.type === 'HIT');
    expect(hit).toMatchObject({ victimId: 'a', source: 'OUT_OF_BOUNDS', creditedTo: undefined });
    expect(types(events)).toContain('SCORE');
    expect(player(s, 'a').outsideFor).toBe(0); // the dead carry no timer
  });

  it('stepping back inside resets the timer: the limit is CONTINUOUS time outside', () => {
    let { s } = run(put(match(), 100), 4.5);
    s = put(s, 800);
    s = run(s, 0.5).s;
    expect(player(s, 'a').outsideFor).toBe(0);
    s = put(s, 100);
    s = run(s, 4.5).s; // 4.5 + 4.5 > 5, but not in one go
    expect(player(s, 'a').alive).toBe(true);
  });

  it('a player is outside when their centre is past the line', () => {
    expect(player(run(put(match(), 200), 1).s, 'a').outsideFor).toBe(0); // on the line: inside
    expect(player(run(put(match(), 199), 1).s, 'a').outsideFor).toBeGreaterThan(0);
    expect(player(run(put(match(), 1401), 1).s, 'a').outsideFor).toBeGreaterThan(0);
  });

  it('a shield does not save an exploding player (and is not spent on it)', () => {
    let s = put(match(), 100);
    s = {
      ...s,
      players: s.players.map((p) =>
        p.id === 'a' ? { ...p, inventory: Object.freeze(['GUARD']) } : p,
      ),
    } as FuState;
    const r = run(s, 5.01);
    expect(player(r.s, 'a').alive).toBe(false);
    expect(r.events.some((e) => e.type === 'GUARD_BLOCKED')).toBe(false);
  });

  it('players may walk out: the safe zone is not a wall', () => {
    const { s } = run(put(match(), 260), 1, input({ a: { move: { x: -1, y: 0 } } }));
    expect(at(s, 'a').x).toBeLessThan(200);
  });

  it('an arena without a safe zone has no border: nobody ever explodes', () => {
    const open = createFuMatch(
      [
        { id: 'a', slot: 0 },
        { id: 'b', slot: 1 },
      ],
      { arena: { width: 1600, height: 900 } },
    );
    const { s } = run(put(open, 40), 8);
    expect(player(s, 'a').alive).toBe(true);
    expect(player(s, 'a').outsideFor).toBe(0);
  });

  it('a safe zone must lie inside the arena and hold every spawn', () => {
    const bad = (safeZone: NonNullable<FuArena['safeZone']>) => () =>
      createFuMatch([{ id: 'a', slot: 0 }], { arena: { ...ARENA, safeZone } });
    expect(bad({ x: -10, y: 0, width: 100, height: 900 })).toThrow(/safe zone/);
    expect(bad({ x: 900, y: 0, width: 400, height: 900 })).toThrow(/safe zone/); // spawn (800, 450) outside it
    expect(() =>
      createFuMatch([{ id: 'a', slot: 0 }], { arena: ARENA, outsideLimitSeconds: 0 }),
    ).toThrow(/outsideLimitSeconds/);
  });
});
