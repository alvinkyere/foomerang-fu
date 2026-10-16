import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { layerParts, parseMapLayers } from '../src/render/reconstructed/mapLayers';

// A reconstructed map's object layers arrive over the network in its manifest: they are checked before the renderer trusts
// them. A layer may carry depth SLICES — its ground-contact line, column by column — so a round or angled object (the fountain,
// a 45-degree stall) hides a player standing behind each part of it and never one standing beside it.

const occluder = (extra: Record<string, unknown> = {}) => ({
  key: '23_fountain',
  file: 'occ_23_fountain.webp',
  x: 798,
  y: 469,
  depth: 795,
  fade: true,
  ...extra,
});

const only = <T>(items: readonly T[]): T => {
  expect(items).toHaveLength(1);
  return items[0] as T;
};

describe('map layers from the manifest', () => {
  it('a plain layer is one part at its own depth, as before', () => {
    const layer = only(parseMapLayers({ occluders: [occluder()] }).occluders);
    expect(layer).toMatchObject({ key: '23_fountain', x: 798, y: 469, depth: 795, fade: true });
    expect(layerParts(layer, 362)).toEqual([{ cropX: 0, width: 362, depth: 795 }]);
  });

  it('a sliced layer is one part per slice: each crops its own columns and sorts at its own ground-contact depth', () => {
    const layer = only(
      parseMapLayers({
        occluders: [
          occluder({
            slices: [
              { x0: 798, x1: 830, depth: 720.5 },
              { x0: 830, x1: 900, depth: 795 },
              { x0: 900, x1: 1160, depth: 760 },
            ],
          }),
        ],
      }).occluders,
    );
    expect(layerParts(layer, 362)).toEqual([
      { cropX: 0, width: 32, depth: 720.5 },
      { cropX: 32, width: 70, depth: 795 },
      { cropX: 102, width: 260, depth: 760 },
    ]);
  });

  it('the character scale defaults to 1 and must be a sane positive number', () => {
    expect(parseMapLayers({ occluders: [] }).characterScale).toBe(1);
    expect(parseMapLayers({ occluders: [], characterScale: 1.144 }).characterScale).toBe(1.144);
    for (const bad of [0, -1, 9, Number.NaN, '1', null])
      expect(() => parseMapLayers({ occluders: [], characterScale: bad })).toThrow(
        /characterScale/,
      );
  });

  it.each([
    ['a non-array occluder list', { occluders: 'x' }],
    ['a missing key', { occluders: [occluder({ key: undefined })] }],
    ['a file outside the map folder', { occluders: [occluder({ file: '../../secret.webp' })] }],
    ['a file that is not an image', { occluders: [occluder({ file: 'occ.js' })] }],
    ['a non-finite position', { occluders: [occluder({ x: Number.POSITIVE_INFINITY })] }],
    ['a non-finite depth', { occluders: [occluder({ depth: 'deep' })] }],
    [
      'a slice ending before it starts',
      { occluders: [occluder({ slices: [{ x0: 900, x1: 900, depth: 1 }] })] },
    ],
    [
      'a slice outside its layer',
      { occluders: [occluder({ slices: [{ x0: 700, x1: 900, depth: 1 }] })] },
    ],
    [
      'overlapping slices',
      {
        occluders: [
          occluder({
            slices: [
              { x0: 798, x1: 850, depth: 1 },
              { x0: 840, x1: 900, depth: 1 },
            ],
          }),
        ],
      },
    ],
    [
      'too many slices',
      { occluders: [occluder({ slices: Array.from({ length: 5000 }, () => ({})) })] },
    ],
  ])('rejects %s', (_what, manifest) => {
    expect(() => parseMapLayers(manifest)).toThrow(/map layers/);
  });

  it('the market plaza (environ2) ships every object as a sliced layer and characters at environ2’s size', () => {
    const manifest = JSON.parse(
      readFileSync(
        join(__dirname, '..', 'public', 'maps', 'market_plaza', 'manifest.json'),
        'utf8',
      ),
    ) as unknown;
    const layers = parseMapLayers(manifest);
    expect(layers.occluders.length).toBe(31);
    for (const o of layers.occluders) expect(o.slices?.length, o.key).toBeGreaterThan(0);
    // characters are as tall as environ2's (45 px at 1280 wide = 67.5 px on the 1920 canvas; the coffee cell is 59 px)
    expect(layers.characterScale).toBeCloseTo(67.5 / 59, 3);
  });
});
