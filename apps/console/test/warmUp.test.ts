import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WARM_UP_ARENA } from '@foomerang/foomerang-fu';
import { FuRuntime } from '../src/runtime/fuRuntime';
import { PLAYABLE_ARENAS } from '../src/runtime/arenas';
import { productArena } from '../src/runtime/powerupMode';
import { rendererKindFor } from '../src/render/rendererKind';
import { RECONSTRUCTED_MAPS } from '../src/render/reconstructed/maps';

// The warm-up (art/warm_up, foomerang-fu physics hq.mp4 0:00): the practice round's map, tested at ?arena=warmup on the plaza's renderer.

describe('the warm-up map', () => {
  it('is chosen by ?arena=warmup, drawn by the plaza’s renderer, a named playable arena', () => {
    expect(productArena('?arena=warmup')).toBe('warm_up');
    expect(rendererKindFor('warm_up')).toBe('three');
    expect(PLAYABLE_ARENAS.warm_up.arena).toBe(WARM_UP_ARENA);
    expect(RECONSTRUCTED_MAPS.warm_up.assetDir).toBe('maps/warm_up/');
  });

  it('ships its model, manifest and water field', () => {
    for (const f of ['plaza.glb', 'manifest.json', 'water.png'])
      expect(existsSync(join(__dirname, '..', 'public', 'maps', 'warm_up', f))).toBe(true);
  });

  it('is a practice round: a match on it is played with the rules’ practice flag (kills count for nothing)', () => {
    const r = new FuRuntime(WARM_UP_ARENA);
    r.start(
      [
        { playerId: 'a', slot: 0 },
        { playerId: 'b', slot: 1 },
      ] as Parameters<FuRuntime['start']>[0],
      0,
    );
    expect(r.state?.config.practice).toBe(true);
  });
});
