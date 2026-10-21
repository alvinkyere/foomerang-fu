import { describe, expect, it } from 'vitest';
import { ICE_LOOK } from '../src/render/iceLook';
import {
  ICE_MOTION,
  blockScale,
  chunkSpot,
  chunksOpacity,
  freezeBody,
  puffAt,
  thawBody,
} from '../src/render/iceMotion';

// Freezing and thawing, timed every frame from the reference video (6:54.53 the hit, block full at 6:54.68; 6:56.38 the ice
// breaks, the frost puff gone by 6:56.55, the chunks gone by 6:57.22).

describe('freezing', () => {
  it('the body goes dark blue at once, then ice-blue as the block grows', () => {
    expect(freezeBody(0)).toBe(ICE_MOTION.coldBody);
    expect(freezeBody(0.15)).toBe(ICE_LOOK.body);
    expect(freezeBody(1)).toBe(ICE_LOOK.body);
  });

  it('the block grows from round the body to full by 0.15 s', () => {
    expect(blockScale(0)).toBe(0);
    expect(blockScale(0.03)).toBeCloseTo(ICE_MOTION.blockStart, 6);
    expect(blockScale(0.09)).toBeGreaterThan(ICE_MOTION.blockStart);
    expect(blockScale(0.15)).toBe(1);
    expect(blockScale(1.5)).toBe(1);
  });
});

describe('thawing', () => {
  it('the blue lifts over 0.1 s', () => {
    expect(thawBody(0)?.amount).toBe(1);
    expect(thawBody(0.05)?.amount).toBeCloseTo(0.5, 6);
    expect(thawBody(0.1)).toBeUndefined();
  });

  it('a frost puff spreads and fades over 0.17 s', () => {
    expect(puffAt(0)?.size).toBeCloseTo(ICE_MOTION.puffFrom, 6);
    expect(puffAt(0.1)?.size).toBeGreaterThan(ICE_MOTION.puffFrom);
    expect(puffAt(0.17)).toBeUndefined();
  });

  it('the chunks lie full until 0.44 s and are gone by 0.84 s, all inside the block', () => {
    expect(chunksOpacity(0.2)).toBe(1);
    expect(chunksOpacity(0.64)).toBeCloseTo(0.5, 6);
    expect(chunksOpacity(0.84)).toBe(0);
    for (let i = 0; i < ICE_MOTION.chunks; i += 1) {
      const c = chunkSpot(i);
      expect(Math.abs(c.x)).toBeLessThan(ICE_LOOK.blockWidth / 2);
    }
  });
});

describe('the ice breaking on the TV', () => {
  it('a puff and chunks, gone by 0.84 s', async () => {
    const THREE = await import('three');
    const { IceShatters } = await import('../src/render/three/iceShatter');
    const scene = new THREE.Scene();
    const ice = new IceShatters(scene);
    ice.shatter(0, 0, 4, 0);
    ice.frame(50);
    expect(ice.count).toBe(1);
    ice.frame(840);
    expect(ice.count).toBe(0);
    expect(scene.children).toHaveLength(0);
  });
});
