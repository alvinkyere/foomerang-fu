import { describe, expect, it } from 'vitest';
import { onGround, type FuArena } from '../src/rules/arena';
import { DT, at, input, make, own, place, player, types } from './support/fixtures';
import type { FuEvent, FuState } from '../src/rules';
import { stepFu } from '../src/rules';

// Falling (owner, 2026-10-22, the sky islands): an arena may say where its ground is (the island tops and the bridges). A
// player whose middle leaves it falls and dies at once: no shield saves them, nobody is credited, and their meter loses a
// hole, as for any death by the arena itself. An arena that says nothing about its ground is ground everywhere.

// two islands joined by a bridge: x 100–500 and x 700–1100 (y 100–500), the bridge between them y 280–320
const ISLES: FuArena = Object.freeze({
  width: 1200,
  height: 600,
  ground: [
    [
      { x: 100, y: 100 },
      { x: 500, y: 100 },
      { x: 500, y: 500 },
      { x: 100, y: 500 },
    ],
    [
      { x: 700, y: 100 },
      { x: 1100, y: 100 },
      { x: 1100, y: 500 },
      { x: 700, y: 500 },
    ],
    [
      { x: 480, y: 280 },
      { x: 720, y: 280 },
      { x: 720, y: 320 },
      { x: 480, y: 320 },
    ],
  ],
  spawns: [
    { x: 300, y: 300 },
    { x: 900, y: 300 },
    { x: 200, y: 200 },
    { x: 1000, y: 200 },
    { x: 200, y: 400 },
    { x: 1000, y: 400 },
  ],
});

const walk = (s: FuState, id: string, move: { x: number; y: number }, seconds: number) => {
  const events: FuEvent[] = [];
  for (let t = 0; t < seconds; t += DT) {
    const r = stepFu(s, input({ [id]: { move } }), DT);
    s = r.state;
    events.push(...r.events);
  }
  return { s, events };
};

describe('falling off the ground', () => {
  it('ground is the arena’s polygons; without any, everywhere is ground', () => {
    expect(onGround({ x: 300, y: 300 }, ISLES)).toBe(true);
    expect(onGround({ x: 600, y: 300 }, ISLES)).toBe(true); // the bridge
    expect(onGround({ x: 600, y: 200 }, ISLES)).toBe(false); // the gap beside it
    expect(onGround({ x: 600, y: 200 }, { width: 1200, height: 600 })).toBe(true);
  });

  it('walking across the bridge is safe', () => {
    let s = place(make(['a', 'b'], { arena: ISLES, roundIntroSeconds: 0 }), 'a', 450, 300);
    s = place(s, 'b', 1000, 450);
    const { s: after, events } = walk(s, 'a', { x: 1, y: 0 }, 1.2);
    expect(player(after, 'a').alive).toBe(true);
    expect(at(after, 'a').x).toBeGreaterThan(700);
    expect(types(events)).not.toContain('HIT');
  });

  it('walking off an island’s edge: the player falls and dies, nobody credited, their meter a hole down', () => {
    let s = place(make(['a', 'b'], { arena: ISLES, roundIntroSeconds: 0 }), 'a', 300, 150);
    s = place(s, 'b', 1000, 450);
    s = { ...s, scores: { ...s.scores, a: 2 } };
    const { s: after, events } = walk(s, 'a', { x: 0, y: -1 }, 1);
    expect(player(after, 'a').alive).toBe(false);
    const hit = events.find((e) => e.type === 'HIT');
    expect(hit).toMatchObject({ victimId: 'a', source: 'FALL', creditedTo: undefined });
    // where they went over: just past the edge
    expect(hit?.type === 'HIT' ? hit.position.y : 0).toBeLessThan(100);
    expect(hit?.type === 'HIT' ? hit.position.y : 0).toBeGreaterThan(100 - 10);
    expect(after.scores['a']).toBe(1);
  });

  it('no shield saves a falling player', () => {
    let s = place(make(['a', 'b'], { arena: ISLES, roundIntroSeconds: 0 }), 'a', 300, 150);
    s = place(s, 'b', 1000, 450);
    s = own(s, 'a', 'SHIELD');
    const { s: after } = walk(s, 'a', { x: 0, y: -1 }, 1);
    expect(player(after, 'a').alive).toBe(false);
  });

  it('every spawn must be on the ground', () => {
    expect(() =>
      make(['a', 'b'], {
        arena: { ...ISLES, spawns: [{ x: 600, y: 200 }, ...(ISLES.spawns ?? []).slice(1)] },
      }),
    ).toThrow(/ground/);
  });
});
