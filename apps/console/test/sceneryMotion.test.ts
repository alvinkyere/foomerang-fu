import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sceneryMotion } from '../src/render/three/sceneryMotion';

// What a map's scenery does (owner, 2026-11-11, the temple court: "the trees seem to become translucent when players walk behind them,
// that should not be the case"): the plaza's trees fade to show a player behind them and sway; the temple court's, as its HQ, do
// neither (measured: its crowns move under 1 px against their planters while the camera holds, its banners hang still).

const manifest = (map: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '..', 'public', 'maps', map, 'manifest.json'), 'utf8'));

describe('a map’s scenery motion', () => {
  it('fades and sways by default (the plaza’s)', () => {
    expect(sceneryMotion({})).toEqual({ fade: true, sway: true });
    expect(sceneryMotion(manifest('market_plaza'))).toEqual({ fade: true, sway: true });
  });

  it('takes a map’s own word, checked', () => {
    expect(sceneryMotion({ scenery: { fade: false, sway: false } })).toEqual({
      fade: false,
      sway: false,
    });
    expect(sceneryMotion({ scenery: { fade: 'no' } })).toEqual({ fade: true, sway: true });
  });

  it('the temple court: its trees never turn see-through and its scenery stands still, as the HQ’s', () => {
    expect(sceneryMotion(manifest('temple_court'))).toEqual({ fade: false, sway: false });
  });
});
