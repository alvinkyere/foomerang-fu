import { describe, expect, it } from 'vitest';
import type { FuArena } from '../src';
import { playMatch } from './support/cpuMatch';
import { place } from './support/fixtures';

// CPUs and water (owner, 2026-11-06): no CPU walks on water; one whose way lies across a gap a dash can clear dashes over it, land to
// land; one with no way stays put calmly, and none jitters back and forth at an edge ("no glitching across all the maps").
const land = (x0: number, x1: number) => [
  { x: x0, y: 100 },
  { x: x1, y: 100 },
  { x: x1, y: 700 },
  { x: x0, y: 700 },
];
// its opponent stands far off on the other island, out of throwing range: to fight it has to get over there
const twoIslands = (gap: number): FuArena => ({
  width: 3000,
  height: 800,
  ground: [land(100, 700), land(700 + gap, 2900)],
  spawns: [200, 400, 600, 2500, 2650, 2800].map((x, i) => ({ x, y: i % 2 === 0 ? 250 : 550 })),
});

// how many 1 s windows, while alive, the body went back and forth (a long path, little net movement)
function dithering(path: { x: number; y: number }[]): number {
  let n = 0;
  for (let t = 0; t + 60 < path.length; t += 30) {
    const w = path.slice(t, t + 60);
    const net = Math.hypot((w[59]?.x ?? 0) - (w[0]?.x ?? 0), (w[59]?.y ?? 0) - (w[0]?.y ?? 0));
    let len = 0;
    for (let i = 1; i < 60; i += 1)
      len += Math.hypot((w[i]?.x ?? 0) - (w[i - 1]?.x ?? 0), (w[i]?.y ?? 0) - (w[i - 1]?.y ?? 0));
    if (net < 40 && len > 150) n += 1;
  }
  return n;
}

function chase(gap: number, seconds: number) {
  const path: { x: number; y: number }[] = [];
  let crossedAt: number | undefined;
  let fell = false;
  playMatch({
    participants: [
      { id: 'a', cpu: 'HARD' },
      { id: 'b', human: () => ({}) },
    ],
    arena: twoIslands(gap),
    steps: 60 * seconds,
    seed: 5,
    start: (s) => place(place(s, 'a', 400, 400), 'b', 2700, 400),
    onStep: (s, events, tick) => {
      const p = s.world.bodies.find((q) => q.id === 'a')?.position;
      const alive = s.players.find((q) => q.id === 'a')?.alive === true;
      if (alive && p !== undefined) path.push({ x: p.x, y: p.y });
      if (crossedAt === undefined && p !== undefined && p.x > 700 + gap && alive) crossedAt = tick;
      if (events.some((e) => e.type === 'HIT' && e.victimId === 'a' && e.source === 'FALL'))
        fell = true;
    },
  });
  return { path, crossedAt, fell };
}

describe('CPUs and water', () => {
  it('dashes across a gap a dash can clear, land to land, to get at its opponent', () => {
    const r = chase(110, 8);
    expect(r.fell).toBe(false);
    expect(r.crossedAt, 'it crossed').toBeDefined();
    expect((r.crossedAt ?? 1e9) / 60).toBeLessThan(6);
  });

  it('with no way across it neither walks onto the water nor jitters at the edge', () => {
    const r = chase(500, 8);
    expect(r.fell).toBe(false);
    expect(r.crossedAt).toBeUndefined();
    expect(dithering(r.path)).toBe(0);
  });
});
