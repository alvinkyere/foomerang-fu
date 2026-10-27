import { describe, expect, it } from 'vitest';
import {
  GONG_ISLANDS_ARENA,
  GONG_ISLANDS_PORTALS,
  stepFu,
  type FuArena,
  type FuEvent,
} from '../src/rules';
import { circleHitsWalls, onGround } from '../src/rules/arena';
import { navGridFor } from '../src/cpu/nav';
import { DT, R, STRAIGHT, at, boom, input, make, place, player } from './support/fixtures';

// Portals (owner, 2026-10-26: "make it work"), as the HQ shows them (foomerang-fu physics hq.mp4 9:09.4-9:09.9: the eggplant
// walks onto the blue portal at the north-west, is gone a frame later and stands at the other blue portal, on the centre
// island, three frames after; 9:40.0 and ff physics hq 2.mp4 8:05: a boomerang thrown into the lower blue portal flies on
// out of the upper one). Each portal has a pad on the ground in front of it; a player whose middle reaches a pad is moved
// to its partner's pad, a flying boomerang likewise, still on its way.

// two pads 1200 apart on an open floor: A at (300, 400), B at (1500, 400)
const PADS: FuArena = Object.freeze({
  width: 1800,
  height: 800,
  portals: [
    { id: 'A', x: 300, y: 400, radius: 30, to: 'B' },
    { id: 'B', x: 1500, y: 400, radius: 30, to: 'A' },
  ],
});

const crossings = (events: readonly FuEvent[]) => events.filter((e) => e.type === 'PORTAL');

describe('portals', () => {
  it('a player who walks onto a portal comes out at its partner, alive, that very step', () => {
    let s = make(['a', 'b'], { arena: PADS, roundIntroSeconds: 0 });
    s = place(place(s, 'a', 200, 400), 'b', 900, 700);
    let moved: FuEvent | undefined;
    for (let t = 0; t < 1 && moved === undefined; t += DT) {
      const r = stepFu(s, input({ a: { move: { x: 1, y: 0 } } }), DT);
      s = r.state;
      moved = crossings(r.events)[0];
    }
    expect(moved).toMatchObject({ type: 'PORTAL', playerId: 'a', from: 'A', to: 'B' });
    expect(Math.hypot(at(s, 'a').x - 1500, at(s, 'a').y - 400)).toBeLessThan(1);
    expect(player(s, 'a').alive).toBe(true);
  });

  it('is not sent straight back while still on the pad it came out on; off it and on again, back it goes', () => {
    let s = make(['a', 'b'], { arena: PADS, roundIntroSeconds: 0 });
    s = place(place(s, 'a', 300, 400), 'b', 900, 700);
    s = stepFu(s, input({}), DT).state; // onto A: to B
    expect(at(s, 'a').x).toBeGreaterThan(1400);
    for (let t = 0; t < 1; t += DT) s = stepFu(s, input({}), DT).state; // standing on B
    expect(at(s, 'a').x).toBeGreaterThan(1400);
    // off B to the east, then back west onto it: to A
    for (let t = 0; t < 0.4; t += DT)
      s = stepFu(s, input({ a: { move: { x: 1, y: 0 } } }), DT).state;
    expect(at(s, 'a').x).toBeGreaterThan(1500 + 30 + R);
    let back = false;
    for (let t = 0; t < 1 && !back; t += DT) {
      const r = stepFu(s, input({ a: { move: { x: -1, y: 0 } } }), DT);
      s = r.state;
      back = crossings(r.events).some((e) => e.type === 'PORTAL' && e.to === 'A');
    }
    expect(back).toBe(true);
    expect(at(s, 'a').x).toBeLessThan(400);
  });

  it('a thrown boomerang that reaches a portal flies on out of its partner, the same way', () => {
    let s = make(['a', 'b'], { ...STRAIGHT, arena: PADS, roundIntroSeconds: 0 });
    s = place(place(s, 'a', 150, 400), 'b', 900, 700);
    s = stepFu(s, input({ a: { move: { x: 1, y: 0 }, throw: true } }), DT).state;
    let through: FuEvent | undefined;
    for (let t = 0; t < 1 && through === undefined; t += DT) {
      const r = stepFu(s, input({}), DT);
      s = r.state;
      through = crossings(r.events)[0];
    }
    expect(through).toMatchObject({ type: 'PORTAL', ownerId: 'a', from: 'A', to: 'B' });
    const b = boom(s, 'a');
    expect(b.state).toBe('THROWN');
    expect(b.position.x).toBeGreaterThan(1500);
    expect(b.direction.x).toBeCloseTo(1);
    // and on its way, east of B, not back through it
    const x = b.position.x;
    s = stepFu(s, input({}), DT).state;
    expect(boom(s, 'a').position.x).toBeGreaterThan(x);
  });

  it('a dead player and a held boomerang do not cross', () => {
    let s = make(['a', 'b'], { arena: PADS, roundIntroSeconds: 0 });
    s = place(place(s, 'a', 300, 400), 'b', 900, 700);
    s = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, alive: false } : p)) };
    const r = stepFu(s, input({}), DT);
    expect(crossings(r.events)).toHaveLength(0);
  });

  it('a CPU plans its way round a pad (it does not know where one leads, so it does not wander through)', () => {
    const grid = navGridFor(PADS, R);
    const [cx, cy] = grid.cellOf({ x: 300, y: 400 });
    expect(grid.isFree(cx, cy)).toBe(false);
    const [ox, oy] = grid.cellOf({ x: 900, y: 400 });
    expect(grid.isFree(ox, oy)).toBe(true);
  });

  it('the gong islands have their four, in two pairs, each pad on open ground; walking onto each lands on its partner', () => {
    expect(GONG_ISLANDS_PORTALS).toHaveLength(4);
    for (const p of GONG_ISLANDS_PORTALS) {
      const partner = GONG_ISLANDS_PORTALS.find((q) => q.id === p.to);
      expect(partner?.to).toBe(p.id);
      expect(onGround(p, GONG_ISLANDS_ARENA)).toBe(true);
      expect(circleHitsWalls(p, R, GONG_ISLANDS_ARENA.walls ?? [])).toBe(false);
      let s = make(['a', 'b'], { arena: GONG_ISLANDS_ARENA, roundIntroSeconds: 0 });
      s = place(s, 'a', p.x, p.y);
      const r = stepFu(s, input({}), DT);
      expect(crossings(r.events)[0], p.id).toMatchObject({ playerId: 'a', from: p.id, to: p.to });
      expect(
        Math.hypot(at(r.state, 'a').x - (partner?.x ?? 0), at(r.state, 'a').y - (partner?.y ?? 0)),
      ).toBeLessThan(R);
      expect(player(r.state, 'a').alive).toBe(true);
    }
  });
});
