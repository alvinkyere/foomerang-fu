import { describe, expect, it } from 'vitest';
import { stepFu, type FuArena } from '../src/rules';
import { toggleSlider, type SliderSpec, type SliderState } from '../src/rules/sliders';
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

// The warm-up's pens (the HQ, foomerang-fu physics hq.mp4 0:00-0:06): each player starts walled in; a slash on (or a boomerang over) the
// pen's lever drops its walls at once and for the rest of the round: struck again, nothing comes back. A new round puts them up again.

const WALL: SliderSpec = {
  wall: { shape: 'box', x: 1000, y: 450, halfWidth: 20, halfHeight: 300, angle: 0 },
  by: { x: 0, y: 0 },
  speed: 0,
  levers: [{ x: 700, y: 450, radius: 30 }],
  drops: true,
};
const arena = (): FuArena => ({
  width: 2000,
  height: 900,
  spawns: [350, 550, 750, 1150, 1350, 1550].map((x) => ({ x, y: 450 })),
  sliders: [WALL],
});
const world = (): FuState => {
  let s = make(['a', 'b'], { ...STRAIGHT, arena: arena() });
  s = place(place(s, 'a', 300, 450), 'b', 1800, 850);
  return face(s, 'a', 1, 0);
};
const home: SliderState = { progress: 0, dir: 0, last: -1 };

describe('a pen wall (a slider that drops)', () => {
  it('a hit drops it at once, and another hit leaves it down', () => {
    const down = toggleSlider(home, WALL);
    expect(down).toMatchObject({ progress: 1, dir: 0 });
    expect(toggleSlider(down, WALL)).toMatchObject({ progress: 1, dir: 0 });
  });

  it('stands as a wall until its lever is struck: a player cannot walk through it', () => {
    const s = place(world(), 'a', 940, 450);
    const r = run(s, 90, input({ a: { move: { x: 1, y: 0 } } }), { repeat: true });
    expect(player(r.state, 'a').alive).toBe(true);
    expect(r.state.world.bodies.find((b) => b.id === 'a')?.position.x ?? 0).toBeLessThan(1000);
  });

  it('a boomerang over its lever drops it, with one LEVER event, and then the player walks through', () => {
    let s = stepFu(world(), input({ a: { throw: true } }), DT).state;
    let levers = 0;
    for (let i = 0; i < 300; i += 1) {
      const r = stepFu(s, input({}), DT);
      levers += r.events.filter((e) => e.type === 'LEVER').length;
      s = r.state;
    }
    expect(s.sliders?.[0]).toMatchObject({ progress: 1 });
    expect(levers).toBe(1); // (home over the lever again: already down, no second event)
    s = place(s, 'a', 940, 450);
    const r = run(s, 90, input({ a: { move: { x: 1, y: 0 } } }), { repeat: true });
    expect(r.state.world.bodies.find((b) => b.id === 'a')?.position.x ?? 0).toBeGreaterThan(1040);
  });

  it('a new round puts it up again', () => {
    const s: FuState = { ...world(), sliders: [{ progress: 1, dir: 0, last: 1 }] };
    const dead = {
      ...s,
      players: s.players.map((p) => (p.id === 'b' ? { ...p, alive: false } : p)),
    };
    const later = run(dead, 400);
    expect(later.state.round).toBe(2);
    expect(later.state.sliders?.[0]).toEqual(home);
  });
});
