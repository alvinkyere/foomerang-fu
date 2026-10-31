import { describe, expect, it } from 'vitest';
import { stepFu, type FuArena } from '../src/rules';
import {
  advanceSlider,
  sliderBox,
  toggleSlider,
  type SliderSpec,
  type SliderState,
} from '../src/rules/sliders';
import {
  DT,
  STRAIGHT,
  face,
  input,
  make,
  place,
  player,
  run,
  type FuState,
} from './support/fixtures';

// The lily island's lever-driven rock (the HQ, foomerang-fu physics hq.mp4 10:37-10:48; the owner, 2026-10-31): a hit on either lever sets the one rock
// sliding to the far edge; it carries on until the lever is hit again, which halts it where it has got to; a further hit sends it back the way
// it came. It shoves whoever is in its way, and a player shoved off the ground falls into the water.

const SPEC: SliderSpec = {
  wall: { shape: 'box', x: 1000, y: 800, halfWidth: 100, halfHeight: 60, angle: 0 },
  by: { x: 0, y: -450 }, // up to y 350
  speed: 300,
  levers: [
    { x: 700, y: 450, radius: 30 },
    { x: 1600, y: 450, radius: 30 },
  ],
};
const GROUND = [
  [
    { x: 0, y: 300 },
    { x: 2000, y: 300 },
    { x: 2000, y: 900 },
    { x: 0, y: 900 },
  ],
];
const SPAWNS = [350, 550, 750, 1150, 1350, 1550].map((x) => ({ x, y: 600 }));
const arena = (): FuArena => ({
  width: 2000,
  height: 900,
  ground: GROUND,
  spawns: SPAWNS,
  sliders: [SPEC],
});
const world = (): FuState => {
  let s = make(['a', 'b'], { ...STRAIGHT, arena: arena() });
  s = place(place(s, 'a', 300, 450), 'b', 1800, 850);
  return face(s, 'a', 1, 0);
};
const THROW = input({ a: { throw: true } });
const state0: SliderState = { progress: 0, dir: 0, last: -1 };

describe('the slider, as pure maths', () => {
  it('sits at home, and at its far end, and between', () => {
    expect(sliderBox(SPEC, 0)).toMatchObject({ x: 1000, y: 800 });
    expect(sliderBox(SPEC, 1)).toMatchObject({ x: 1000, y: 350 });
    expect(sliderBox(SPEC, 0.5)).toMatchObject({ x: 1000, y: 575 });
  });

  it('a hit at home sets it going to the far end; a hit while it moves halts it where it is; a hit again sends it back', () => {
    const going = toggleSlider(state0);
    expect(going.dir).toBe(1);
    const moving = advanceSlider(SPEC, going, 0.5); // 150 of 450
    expect(moving.progress).toBeCloseTo(1 / 3, 6);
    const halted = toggleSlider(moving);
    expect(halted).toMatchObject({ dir: 0 });
    expect(advanceSlider(SPEC, halted, 5).progress).toBeCloseTo(1 / 3, 6); // stays put
    const back = toggleSlider(halted);
    expect(back.dir).toBe(-1); // the way it came
    expect(advanceSlider(SPEC, back, 5).progress).toBe(0); // and stops at home
  });

  it('stops at the far end and a hit there sends it home', () => {
    const arrived = advanceSlider(SPEC, toggleSlider(state0), 10);
    expect(arrived).toMatchObject({ progress: 1, dir: 0 });
    expect(toggleSlider(arrived).dir).toBe(-1);
  });
});

describe('in the match', () => {
  it('starts at home and is a solid wall there', () => {
    const s = world();
    expect(s.sliders).toEqual([state0]);
  });

  it('a boomerang flying over a lever sets it going; the same boomerang coming home over it halts it where it has got to', () => {
    let s = stepFu(world(), THROW, DT).state;
    let started = false;
    let events = 0;
    for (let i = 0; i < 400; i += 1) {
      const r = stepFu(s, input({}), DT);
      s = r.state;
      events += r.events.filter((e) => e.type === 'LEVER').length;
      if (!started && (s.sliders?.[0]?.dir ?? 0) === 1) started = true;
    }
    expect(started).toBe(true);
    expect(events).toBe(2); // out over the lever, and home over it
    const end = s.sliders?.[0];
    expect(end?.dir).toBe(0); // halted
    expect(end?.progress).toBeGreaterThan(0);
    expect(end?.progress).toBeLessThan(1);
    const frozen = end?.progress;
    expect(run(s, 120).state.sliders?.[0]?.progress).toBe(frozen); // it stays where it halted
  });

  it('a player in its way is shoved, and one shoved off the ground falls and dies', () => {
    let s = world();
    s = place(s, 'b', 1000, 700); // in the rock's path, with the edge of the ground ahead of it
    s = { ...s, sliders: [{ progress: 0, dir: 1, last: -1 }] }; // (the lever already hit)
    const r = run(s, 100);
    expect(player(r.state, 'b').alive).toBe(false); // (shoved up past the ground's edge at y 300)
  });

  it('a new round puts it home again', () => {
    let s = place(world(), 'b', 1000, 700);
    s = { ...s, sliders: [{ progress: 0, dir: 1, last: -1 }] };
    const r = run(s, 100); // b falls: the round is over
    expect(r.state.round).toBe(1);
    const later = run(r.state, 400); // the end beat passes, round 2 begins
    expect(later.state.round).toBe(2);
    expect(later.state.sliders?.[0]).toEqual({ progress: 0, dir: 0, last: -1 });
  });
});
