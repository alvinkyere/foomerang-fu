import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FU_CONFIG as C,
  MARKET_PLAZA_ARENA,
  PRIMITIVE_ARENA,
  createFuMatch,
  distanceToSolid,
  spawnsForRound,
  stepFu,
  type FuArena,
  type FuState,
} from '../src/rules';
import { distanceToRect } from '../src/rules/arena';
import { DT, NONE, kill } from './support/fixtures';

// Where players start each round (owner, 2026-10-19: "no player should spawn at the same place ever ... it must be at a fair
// distance and not the same, especially in a row"). Round 1 is the map's own spawn points. From round 2 every player gets a new
// place on open, reachable floor: never where they have started before in this match, far from where they started last round,
// and a fair distance from everyone else. Deterministic from the match's seed (pure rules: no randomness of their own).

const ids = (n: number) => ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n);
const far = (p: { x: number; y: number }, q: { x: number; y: number }) =>
  Math.hypot(p.x - q.x, p.y - q.y);

function plan(arena: FuArena, n: number, rounds: number, seed = 1) {
  const config = { ...C, arena, seed };
  const specs = ids(n).map((id, slot) => ({ id, slot }));
  return Array.from({ length: rounds }, (_, r) => spawnsForRound(specs, config, r + 1));
}

describe.each([
  ['market_plaza', MARKET_PLAZA_ARENA],
  ['the primitive arena', PRIMITIVE_ARENA],
] as const)('spawns in %s', (_, arena) => {
  for (const n of [2, 4, 6]) {
    const rounds = plan(arena, n, 12);

    it(`${n} players: round 1 is the map's own spawn points`, () => {
      const first = rounds[0] as ReadonlyMap<string, { x: number; y: number }>;
      ids(n).forEach((id, slot) => {
        const given = arena.spawns?.[slot];
        if (given !== undefined) expect(first.get(id)).toEqual(given);
      });
    });

    it(`${n} players, 12 rounds: nobody ever starts where they started before, nor near last round's place`, () => {
      for (const id of ids(n)) {
        const mine = rounds.map((r) => r.get(id) as { x: number; y: number });
        mine.forEach((p, r) => {
          for (let earlier = 0; earlier < r; earlier += 1)
            expect(
              far(p, mine[earlier] as typeof p),
              `${id} round ${r + 1} vs ${earlier + 1}`,
            ).toBeGreaterThanOrEqual(C.spawnFreshDistance);
          if (r > 0)
            expect(
              far(p, mine[r - 1] as typeof p),
              `${id} round ${r + 1} in a row`,
            ).toBeGreaterThanOrEqual(C.spawnMoveDistance);
        });
      }
    });

    it(`${n} players: every round, everyone starts a fair distance from everyone else`, () => {
      rounds.forEach((r, k) => {
        const at = [...r.values()];
        for (let i = 0; i < at.length; i += 1)
          for (let j = i + 1; j < at.length; j += 1)
            expect(far(at[i] as never, at[j] as never), `round ${k + 1}`).toBeGreaterThanOrEqual(
              C.spawnSeparation,
            );
      });
    });

    it(`${n} players: every place is open floor, clear of every wall, prop, gate and hazard, inside the border`, () => {
      const clear = C.playerRadius;
      for (const r of rounds.slice(1))
        for (const p of r.values()) {
          for (const w of arena.walls ?? []) expect(distanceToSolid(p, w)).toBeGreaterThan(clear);
          for (const b of arena.breakables ?? [])
            expect(distanceToSolid(p, b)).toBeGreaterThan(clear);
          for (const g of arena.gates ?? [])
            expect(distanceToRect(p, g.rect)).toBeGreaterThan(clear);
          for (const h of arena.hazards ?? [])
            expect(distanceToRect(p, h.rect)).toBeGreaterThan(clear);
          const zone = arena.safeZone ?? { x: 0, y: 0, width: arena.width, height: arena.height };
          expect(p.x - clear).toBeGreaterThanOrEqual(zone.x);
          expect(p.y - clear).toBeGreaterThanOrEqual(zone.y);
          expect(p.x + clear).toBeLessThanOrEqual(zone.x + zone.width);
          expect(p.y + clear).toBeLessThanOrEqual(zone.y + zone.height);
        }
    });
  }

  it('the same seed plans the same places; another seed plans others', () => {
    expect(plan(arena, 4, 5, 7)).toEqual(plan(arena, 4, 5, 7));
    expect(plan(arena, 4, 5, 8)[1]).not.toEqual(plan(arena, 4, 5, 7)[1]);
  });
});

describe('through a match', () => {
  it('round 2 starts everyone at the planned places, not at round 1’s', () => {
    let s: FuState = createFuMatch(
      ids(4).map((id, slot) => ({ id, slot })),
      { arena: MARKET_PLAZA_ARENA, seed: 3 },
    );
    const first = new Map(s.world.bodies.map((b) => [b.id, b.position]));
    s = kill(kill(kill(s, 'b'), 'c'), 'd');
    for (let i = 0; i < 60 * 5 && s.round === 1; i += 1) s = stepFu(s, NONE, DT).state;
    expect(s.round).toBe(2);
    const planned = spawnsForRound(
      ids(4).map((id, slot) => ({ id, slot })),
      s.config,
      2,
    );
    for (const b of s.world.bodies) {
      expect(b.position).toEqual(planned.get(b.id));
      expect(far(b.position, first.get(b.id) as never)).toBeGreaterThanOrEqual(C.spawnMoveDistance);
    }
  });
});
