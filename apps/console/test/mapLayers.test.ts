import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { layerFrame, layerParts, parseMapLayers } from '../src/render/reconstructed/mapLayers';

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

  it('an animated layer is a sheet of equal frames played over its period; its slices crop the current frame', () => {
    const layer = only(
      parseMapLayers({
        occluders: [
          occluder({
            animation: { frames: 60, periodS: 4, width: 362, height: 245 },
            slices: [
              { x0: 798, x1: 900, depth: 720 },
              { x0: 900, x1: 1160, depth: 760 },
            ],
          }),
        ],
      }).occluders,
    );
    expect(layer.animation).toEqual({ frames: 60, periodS: 4, width: 362, height: 245 });
    // the frame shown at a time: the elapsed fraction of the period, wrapped (the loop is seamless)
    expect(layerFrame(layer, 0)).toBe(0);
    expect(layerFrame(layer, 1000)).toBe(15);
    expect(layerFrame(layer, 3999)).toBe(59);
    expect(layerFrame(layer, 4000)).toBe(0);
    expect(layerFrame(layer, 6000)).toBe(30);
    // slices crop within the frame, at the frame's own width
    expect(layerParts(layer, 362)).toEqual([
      { cropX: 0, width: 102, depth: 720 },
      { cropX: 102, width: 260, depth: 760 },
    ]);
    // a still layer is always frame 0
    expect(layerFrame(only(parseMapLayers({ occluders: [occluder()] }).occluders), 1234)).toBe(0);
  });

  it.each([
    ['no frames', { frames: 0, periodS: 4, width: 10, height: 10 }],
    ['too many frames', { frames: 1000, periodS: 4, width: 10, height: 10 }],
    ['a non-integer frame count', { frames: 2.5, periodS: 4, width: 10, height: 10 }],
    ['no period', { frames: 4, periodS: 0, width: 10, height: 10 }],
    ['a huge frame', { frames: 4, periodS: 4, width: 9000, height: 10 }],
    ['a missing size', { frames: 4, periodS: 4 }],
  ])('rejects an animation with %s', (_what, animation) => {
    expect(() => parseMapLayers({ occluders: [occluder({ animation })] })).toThrow(/map layers/);
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
    // the plaza is alive: the bunting, both banners, the five trees and the fountain play the 3D plaza's loop
    const animated = layers.occluders.filter((o) => o.animation !== undefined).map((o) => o.key);
    expect(animated.sort()).toEqual(
      [
        '02_banner_l',
        '03_banner_r',
        '23_fountain',
        '24_bunting',
        '25_tree',
        '26_tree',
        '27_tree',
        '28_tree',
        '29_tree',
      ].sort(),
    );
    for (const o of layers.occluders)
      if (o.animation !== undefined) expect(o.animation.periodS, o.key).toBe(4);
    // the fountain is low: it never fades (fading it would show the floor beneath it)
    expect(layers.occluders.find((o) => o.key === '23_fountain')?.fade).toBe(false);
    // characters are as tall as environ2's (45 px at 1280 wide = 67.5 px on the 1920 canvas; the coffee cell is 59 px)
    expect(layers.characterScale).toBeCloseTo(67.5 / 59, 3);
  });
});
