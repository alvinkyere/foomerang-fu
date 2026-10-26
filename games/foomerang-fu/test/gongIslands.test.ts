import { describe, expect, it } from 'vitest';
import {
  GONG_ISLANDS_ARENA,
  GONG_ISLANDS_BOOK_SPOTS,
  GONG_ISLANDS_BREAKABLES,
  GONG_ISLANDS_FENCES,
  GONG_ISLANDS_GROUND,
  GONG_ISLANDS_SPAWNS,
  GONG_ISLANDS_WALLS,
  createFuMatch,
  stepFu,
} from '../src/rules';
import { circleHitsWalls, onGround } from '../src/rules/arena';
import { DT, R, at, input, make, place, player } from './support/fixtures';
import { playMatch } from './support/cpuMatch';

// The gong islands: the sky islands of the HQ videos (art/sky_islands, generated). Their ground is the island tops and the
// bridges; walking off falls (falling.test.ts has the rule itself).

/** The bridges, north, south and east (art/sky_islands/arena.py): the only four-cornered ground. */
const BRIDGES = GONG_ISLANDS_GROUND.filter((poly) => poly.length === 4);

describe('the gong islands', () => {
  it('six islands (and where two of them meet) and three bridges are its ground; blocks, posts, trunks and bamboo are solid; pots and crates break', () => {
    // five bodies of rock (islands that meet are one), three bridges, the south and log bridges' stone landings
    expect(GONG_ISLANDS_GROUND).toHaveLength(10);
    expect(BRIDGES).toHaveLength(3);
    expect(GONG_ISLANDS_WALLS.filter((w) => w.kind === 'GONG')).toHaveLength(2);
    expect(GONG_ISLANDS_WALLS.filter((w) => w.kind === 'BLOCK').length).toBeGreaterThan(8);
    expect(GONG_ISLANDS_BREAKABLES.filter((b) => b.kind === 'POT')).toHaveLength(10);
    expect(GONG_ISLANDS_BREAKABLES.filter((b) => b.kind === 'CRATE')).toHaveLength(2);
    expect(createFuMatch([{ id: 'a', slot: 0 }], { arena: GONG_ISLANDS_ARENA }).config.arena).toBe(
      GONG_ISLANDS_ARENA,
    );
  });

  it('every spawn and Book spot stands on open ground, a body’s width from any edge', () => {
    const solids = [...GONG_ISLANDS_WALLS, ...GONG_ISLANDS_BREAKABLES, ...GONG_ISLANDS_FENCES];
    for (const p of [...GONG_ISLANDS_SPAWNS, ...GONG_ISLANDS_BOOK_SPOTS]) {
      expect(circleHitsWalls(p, R + 10, solids), `${p.x},${p.y}`).toBe(false);
      for (let k = 0; k < 8; k += 1) {
        const q = {
          x: p.x + Math.cos((k * Math.PI) / 4) * R * 2,
          y: p.y + Math.sin((k * Math.PI) / 4) * R * 2,
        };
        expect(onGround(q, GONG_ISLANDS_ARENA), `${p.x},${p.y} toward ${k}`).toBe(true);
      }
    }
  });

  it('the north bridge carries a player from the centre island to the north one', () => {
    const north = BRIDGES[0];
    expect(north).toBeDefined();
    const xs = (north ?? []).map((p) => p.x);
    const ys = (north ?? []).map((p) => p.y);
    const x = (Math.min(...xs) + Math.max(...xs)) / 2;
    let s = make(['a', 'b'], { arena: GONG_ISLANDS_ARENA, roundIntroSeconds: 0 });
    s = place(s, 'a', x, Math.max(...ys) + 40);
    // walking north until just past the bridge's far end
    for (let t = 0; t < 3 && at(s, 'a').y > Math.min(...ys) - 40; t += DT)
      s = stepFu(s, input({ a: { move: { x: 0, y: -1 } } }), DT).state;
    expect(player(s, 'a').alive).toBe(true);
    expect(at(s, 'a').y).toBeLessThan(Math.min(...ys));
  });

  it('every bridge carries a player across and onto the island at its far end, both ways, down its middle and by either rail (owner, 2026-10-26: "I slip through the ground")', () => {
    for (const [name, i] of [
      ['north', 0],
      ['south', 1],
      ['east', 2],
    ] as const) {
      const quad = BRIDGES[i] ?? [];
      // its ends: the two short sides; walk from 60 px short of one end's middle to 60 px past the other's
      const sides = quad.map((p, k) => [p, quad[(k + 1) % quad.length] ?? p] as const);
      const [e1, e2] = [...sides]
        .sort(
          (a, b) =>
            Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) -
            Math.hypot(b[0].x - b[1].x, b[0].y - b[1].y),
        )
        .slice(0, 2);
      if (e1 === undefined || e2 === undefined) throw new Error('no bridge');
      const mid = (
        e: readonly [{ x: number; y: number }, { x: number; y: number }],
        f: number,
      ) => ({
        x: e[0].x + (e[1].x - e[0].x) * f,
        y: e[0].y + (e[1].y - e[0].y) * f,
      });
      for (const f of [0.5, 0.3, 0.7])
        for (const [from, to] of [
          [e1, e2],
          [e2, e1],
        ] as const) {
          const a = mid(from, f);
          // (the far end's point across from this one: the ends' first corners face opposite ways)
          const b = mid(to, 1 - f);
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
          let s = make(['a', 'b'], { arena: GONG_ISLANDS_ARENA, roundIntroSeconds: 0 });
          s = place(s, 'a', a.x - u.x * 60, a.y - u.y * 60);
          let fell = false; // (a fall ends the round and the next one brings them back: watch for the fall itself)
          for (
            let t = 0;
            !fell && t < 6 && (at(s, 'a').x - a.x) * u.x + (at(s, 'a').y - a.y) * u.y < len + 60;
            t += DT
          ) {
            const r = stepFu(s, input({ a: { move: u } }), DT);
            s = r.state;
            fell = r.events.some((e) => e.type === 'HIT' && e.source === 'FALL');
          }
          expect(fell, `${name} bridge, ${f} across`).toBe(false);
        }
    }
  });

  it('a bridge has rails: a player walking sideways off it is stopped at its side, not dropped (owner, 2026-10-23)', () => {
    const north = BRIDGES[0] ?? []; // the north bridge: planks from the centre island up to the north bar
    const xs = north.map((p) => p.x);
    const ys = north.map((p) => p.y);
    const mid = {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
    for (const side of [-1, 1]) {
      let s = make(['a', 'b'], { arena: GONG_ISLANDS_ARENA, roundIntroSeconds: 0 });
      s = place(s, 'a', mid.x, mid.y);
      for (let t = 0; t < 2; t += DT)
        s = stepFu(s, input({ a: { move: { x: side, y: 0 } } }), DT).state;
      expect(player(s, 'a').alive, `walking ${side < 0 ? 'west' : 'east'}`).toBe(true);
      expect(Math.abs(at(s, 'a').x - mid.x)).toBeLessThan((Math.max(...xs) - Math.min(...xs)) / 2);
    }
    expect(GONG_ISLANDS_FENCES).toHaveLength(6); // two to a bridge: fences, which a boomerang flies over
  });

  it('CPUs play on it without walking off its edges', () => {
    let falls = 0;
    playMatch({
      participants: [
        { id: 'a', cpu: 'HARD' },
        { id: 'b', cpu: 'MEDIUM' },
        { id: 'c', cpu: 'EASY' },
        { id: 'd', cpu: 'MEDIUM' },
      ],
      arena: GONG_ISLANDS_ARENA,
      seed: 4,
      steps: 60 * 40,
      onStep: (_s, events) => {
        for (const e of events) if (e.type === 'HIT' && e.source === 'FALL') falls += 1;
      },
    });
    expect(falls).toBe(0);
  }, 60_000);
});
