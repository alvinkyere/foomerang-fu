import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSoftLook, skyAt } from '../src/render/three/softLook';

// A map's own look (the gong islands, 2026-10-22): soft light, and the rock fading into the mist below the tops. The manifest
// is a file we ship; a bad `look` fails loudly instead of drawing nonsense.

describe('a map’s soft look', () => {
  it('a map without one keeps the plaza’s toon light', () => {
    expect(parseSoftLook(undefined)).toBeUndefined();
  });

  const SKY = [
    { at: 0, colour: '#e0f2d4' },
    { at: 1, colour: '#eff7eb' },
  ];
  it('reads the sky by height on the screen, the tint the rock turns before it, and from how far down to how far down', () => {
    expect(parseSoftLook({ sky: SKY, mist: { tint: '#ebebd6', from: 0.8, to: 14 } })).toEqual({
      sky: SKY,
      mist: { tint: '#ebebd6', from: 0.8, to: 14 },
    });
  });

  it('the sky between its stops is a straight blend', () => {
    const look = parseSoftLook({ sky: SKY, mist: { tint: '#ebebd6', from: 0.8, to: 14 } });
    expect(look).toBeDefined();
    if (look === undefined) return;
    expect(skyAt(look, 0).getHexString()).toBe('e0f2d4');
    expect(skyAt(look, 1).getHexString()).toBe('eff7eb');
    expect(skyAt(look, 2).getHexString()).toBe('eff7eb');
  });

  it.each([
    null,
    {},
    { mist: { tint: '#ebebd6', from: 0.8, to: 14 } },
    { sky: [{ at: 0, colour: '#e0f2d4' }], mist: { tint: '#ebebd6', from: 0.8, to: 14 } },
    {
      sky: [
        { at: 0.5, colour: '#e0f2d4' },
        { at: 0.2, colour: '#eff7eb' },
      ],
      mist: { tint: '#ebebd6', from: 0.8, to: 14 },
    },
    {
      sky: [
        { at: 0, colour: 'mist' },
        { at: 1, colour: '#eff7eb' },
      ],
      mist: { tint: '#ebebd6', from: 0.8, to: 14 },
    },
    {
      sky: [
        { at: 0, colour: '#e0f2d4' },
        { at: 1, colour: '#eff7eb' },
      ],
      mist: { tint: '#ebebd6', from: 14, to: 0.8 },
    },
  ])('refuses %j', (raw) => {
    expect(() => parseSoftLook(raw)).toThrow(/look/);
  });

  it('the gong islands ship one', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'public/maps/gong_islands/manifest.json'), 'utf8'),
    ) as { look?: unknown };
    expect(parseSoftLook(manifest.look)?.mist.tint).toBe('#ebebd6');
  });
});
