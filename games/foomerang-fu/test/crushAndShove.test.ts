import { describe, expect, it } from 'vitest';
import { type FuArena, type FuEvent } from '../src/rules';
import { toggleSlider, type SliderSpec, type SliderState } from '../src/rules/sliders';
import { STRAIGHT, face, input, make, place, player, run, type FuState } from './support/fixtures';

// The bridge islands' walls and pushes (owner, 2026-11-11): a lever hit sends the whole bridge one way or the other (a hit while it moves sends
// it back, it never pauses); a player the slabs pin is CRUSHED, and the kill is the lever puller's; a player shoved into the water, by the
// slabs or by another player walking into them, is a kill for whoever shoved; a player who walks into the water on their own is nobody's.

const LEVERS = [
  { x: 300, y: 300, radius: 30 },
  { x: 1700, y: 300, radius: 30 },
];
// two walls closing on each other: A comes down from y 500 to 700, B up from 1000 to 800; at the end they touch at y 750
const A: SliderSpec = {
  wall: { shape: 'box', x: 1000, y: 500, halfWidth: 200, halfHeight: 50, angle: 0 },
  by: { x: 0, y: 200 },
  speed: 200,
  levers: LEVERS,
  lag: { out: 0, back: 0 },
  reverseOnHit: true,
};
const B: SliderSpec = { ...A, wall: { ...A.wall, y: 1000 }, by: { x: 0, y: -200 } };
const arena = (): FuArena => ({
  width: 2000,
  height: 1400,
  // ground: everything but a strip of water at x > 1800
  ground: [
    [
      { x: 0, y: 0 },
      { x: 1800, y: 0 },
      { x: 1800, y: 1400 },
      { x: 0, y: 1400 },
    ],
  ],
  spawns: [150, 350, 550, 1100, 1220, 1340].map((y, i) => ({ x: i % 2 === 0 ? 150 : 400, y })),
  sliders: [A, B],
});
const world = (): FuState =>
  place(place(make(['a', 'b'], { ...STRAIGHT, arena: arena() }), 'a', 150, 150), 'b', 400, 1300);
const hit = (events: readonly FuEvent[], victim: string) =>
  events.find(
    (e): e is Extract<FuEvent, { type: 'HIT' }> => e.type === 'HIT' && e.victimId === victim,
  );

describe('the bridge as one: a hit sends it the other way, never pauses it', () => {
  it('a hit while it closes sends it back open at once', () => {
    const moving: SliderState = { progress: 0.5, dir: 1, last: -1, aim: 1 };
    const back = toggleSlider(moving, A);
    expect(back.dir).toBe(-1);
    expect(back.progress).toBe(0.5);
  });
  it('a hit at rest open closes it; a hit at rest closed opens it; every slab of the bridge agrees', () => {
    expect(toggleSlider({ progress: 0, dir: 0, last: -1 }, A).dir).toBe(1);
    expect(toggleSlider({ progress: 1, dir: 0, last: 1, aim: 1 }, A).dir).toBe(-1);
    // one slab that had not set off yet (still waiting) and one that had: after the next hit both go home
    const waiting = toggleSlider({ progress: 0, dir: 1, last: -1, aim: 1, wait: 0.2 }, A);
    const going = toggleSlider({ progress: 0.3, dir: 1, last: -1, aim: 1 }, A);
    expect(waiting.aim).toBe(-1);
    expect(going.aim).toBe(-1);
    expect(going.dir).toBe(-1);
  });
});

describe('crushed by the bridge', () => {
  it('a player pinned between the closing walls dies, CRUSHED, and the kill is the lever puller’s', () => {
    let s = place(world(), 'b', 1000, 750);
    s = {
      ...s,
      sliders: [
        { progress: 0.2, dir: 1, last: -1, aim: 1, by: 'a' },
        { progress: 0.2, dir: 1, last: -1, aim: 1, by: 'a' },
      ],
    };
    const r = run(s, 120);
    const h = hit(r.events, 'b');
    expect(player(r.state, 'b').alive).toBe(false);
    expect(h?.source).toBe('CRUSH');
    expect(h?.creditedTo).toBe('a');
  });
});

describe('shoved into the water', () => {
  it('by another player walking into them: the kill is the shover’s', () => {
    let s = place(place(world(), 'b', 1790, 1300), 'a', 1700, 1300);
    s = face(s, 'a', 1, 0);
    const r = run(s, 90, input({ a: { move: { x: 1, y: 0 } } }), { repeat: true });
    const h = hit(r.events, 'b');
    expect(player(r.state, 'b').alive).toBe(false);
    expect(h?.source).toBe('FALL');
    expect(h?.creditedTo).toBe('a');
  });
  it('walking in on their own, with nobody near: nobody’s kill', () => {
    const s = place(world(), 'b', 1750, 1300);
    const r = run(s, 90, input({ b: { move: { x: 1, y: 0 } } }), { repeat: true });
    const h = hit(r.events, 'b');
    expect(h?.source).toBe('FALL');
    expect(h?.creditedTo).toBeUndefined();
  });
});
