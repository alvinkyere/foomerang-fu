import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { frameAt, parsePortalSpin, ringAt, spinAt } from '../src/render/three/portalSpin';

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

  it('its ring moves out and fades on its measured curve, the same each period', () => {
    const s = parsePortalSpin({
      ...SPIN,
      ring: [
        [0, 0.4, 0.4, 0.6],
        [2, 1.2, 0, 1],
        [4, 0.4, 0.4, 0.6],
      ],
    });
    if (s === undefined) throw new Error('no spin');
    expect(ringAt(s, 1000)).toEqual({ out: 0.8, up: 0.2, opacity: 0.8 });
    expect(ringAt(s, 2000)).toEqual({ out: 1.2, up: 0, opacity: 1 });
    expect(ringAt(s, 4000 + 1000)).toEqual(ringAt(s, 1000));
  });

  it('a map may have no ring (none is drawn), but a bad one is refused', () => {
    const s = parsePortalSpin(SPIN);
    if (s === undefined) throw new Error('no spin');
    expect(ringAt(s, 1000)).toBeUndefined();
    for (const ring of [
      [[0, 0.4, 0.4, 0.6]],
      [
        [0, 0.4, 0.4, 2],
        [4, 0.4, 0.4, 0.6],
      ],
      [
        [0, 0.4, 0.4, 0.6],
        [3, 0.4, 0.4, 0.6],
      ],
    ])
      expect(() => parsePortalSpin({ ...SPIN, ring })).toThrow(/portals/);
  });

  it('its swirl may be frames played through the period, each crossfading into the next', () => {
    const s = parsePortalSpin({ ...SPIN, frames: { count: 4, columns: 2, rows: 2 } });
    if (s === undefined) throw new Error('no spin');
    expect(frameAt(s, 0)).toEqual({ from: 0, to: 1, mix: 0 });
    expect(frameAt(s, 1500)).toEqual({ from: 1, to: 2, mix: 0.5 });
    expect(frameAt(s, 3500)).toEqual({ from: 3, to: 0, mix: 0.5 }); // (the last into the first)
    expect(frameAt(s, 4000 + 1500)).toEqual(frameAt(s, 1500));
    expect(frameAt(parsePortalSpin(SPIN) ?? s, 0)).toBeUndefined();
    for (const frames of [
      { count: 0, columns: 1, rows: 1 },
      { count: 5, columns: 2, rows: 2 },
    ])
      expect(() => parsePortalSpin({ ...SPIN, frames })).toThrow(/portals/);
  });

  it('the gong islands ship the HQ’s', () => {
    const manifest = JSON.parse(
      readFileSync(join(__dirname, '../public/maps/gong_islands/manifest.json'), 'utf8'),
    ) as { portals?: unknown };
    const s = parsePortalSpin(manifest.portals);
    expect(s?.period).toBeCloseTo(3.86);
    expect(s === undefined ? undefined : ringAt(s, 480)?.opacity).toBeGreaterThan(0.5);
    expect(s?.frames?.count).toBe(80);
  });
});
