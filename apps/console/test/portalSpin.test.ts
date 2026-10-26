import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePortalSpin, spinAt } from '../src/render/three/portalSpin';

// The gong islands' portals (owner, 2026-10-26: "the portals have a certain animation ... exactly like it is in the video"):
// the "G" on each turns in its face's plane on the HQ's curve, one turn a period (art/sky_islands/portals.py measures it).

const SPIN = {
  period: 4,
  spin: [
    [0, 0],
    [1, 0],
    [3, 180],
    [4, 360],
  ],
};

describe('a portal’s spin', () => {
  it('a map without portals has none', () => {
    expect(parsePortalSpin(undefined)).toBeUndefined();
  });

  it('follows its curve between the measured points, in radians, anticlockwise', () => {
    const s = parsePortalSpin(SPIN);
    if (s === undefined) throw new Error('no spin');
    expect(spinAt(s, 0)).toBeCloseTo(0);
    expect(spinAt(s, 500)).toBeCloseTo(0); // held
    expect(spinAt(s, 2000)).toBeCloseTo(Math.PI / 2);
    expect(spinAt(s, 3500)).toBeCloseTo((270 * Math.PI) / 180);
  });

  it('runs on round after round with no jump: each period ends a whole turn on from where it began', () => {
    const s = parsePortalSpin(SPIN);
    if (s === undefined) throw new Error('no spin');
    const step = (ms: number) => spinAt(s, ms + 1) - spinAt(s, ms);
    expect(Math.abs(step(3999.5))).toBeLessThan(0.01);
    expect(spinAt(s, 4000 + 2000)).toBeCloseTo(spinAt(s, 2000) + 2 * Math.PI);
  });

  it('a bad one is refused (the manifest is a file we ship: it fails loudly)', () => {
    for (const bad of [
      { period: 0, spin: SPIN.spin },
      { period: 4, spin: [[0, 0]] },
      {
        period: 4,
        spin: [
          [0, 0],
          [5, 360],
        ],
      },
      {
        period: 4,
        spin: [
          [0, 0],
          [2, 90],
          [1, 180],
          [4, 360],
        ],
      },
      {
        period: 4,
        spin: [
          [0, 0],
          [4, 300],
        ],
      },
      {
        period: 4,
        spin: [
          [0, 'x'],
          [4, 360],
        ],
      },
    ])
      expect(() => parsePortalSpin(bad)).toThrow(/portals/);
  });

  it('the gong islands ship the HQ’s', () => {
    const manifest = JSON.parse(
      readFileSync(join(__dirname, '../public/maps/gong_islands/manifest.json'), 'utf8'),
    ) as { portals?: unknown };
    const s = parsePortalSpin(manifest.portals);
    expect(s?.period).toBeCloseTo(3.86);
  });
});
