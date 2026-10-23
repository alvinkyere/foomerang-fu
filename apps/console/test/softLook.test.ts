import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSoftLook } from '../src/render/three/softLook';

// A map's own look (the gong islands, 2026-10-22): soft light, and the rock fading into the mist below the tops. The manifest
// is a file we ship; a bad `look` fails loudly instead of drawing nonsense.

describe('a map’s soft look', () => {
  it('a map without one keeps the plaza’s toon light', () => {
    expect(parseSoftLook(undefined)).toBeUndefined();
  });

  it('reads the mist: its colour, and from how far down to how far down the rock fades into it', () => {
    expect(parseSoftLook({ mist: { colour: '#e5f3de', from: 0.8, to: 14 } })).toEqual({
      mist: { colour: '#e5f3de', from: 0.8, to: 14 },
    });
  });

  it.each([
    null,
    {},
    { mist: { colour: 'mist', from: 0.8, to: 14 } },
    { mist: { colour: '#e5f3de', from: '0.8', to: 14 } },
    { mist: { colour: '#e5f3de', from: 14, to: 0.8 } },
    { mist: { colour: '#e5f3de', from: 0, to: Number.POSITIVE_INFINITY } },
  ])('refuses %j', (raw) => {
    expect(() => parseSoftLook(raw)).toThrow(/look/);
  });

  it('the gong islands ship one', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'public/maps/gong_islands/manifest.json'), 'utf8'),
    ) as { look?: unknown };
    expect(parseSoftLook(manifest.look)?.mist.colour).toBe('#e5f3de');
  });
});
