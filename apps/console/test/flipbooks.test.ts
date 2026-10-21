import { describe, expect, it } from 'vitest';
import { flipbookFrame, frameOffset, type FlipbookMeta } from '../src/render/three/flipbooks';

// The video's own effects, played back frame by frame (art/physics_reference/vfx_extract.py cuts them out).

const meta: FlipbookMeta = {
  name: 'x',
  fps: 30,
  frames: 7,
  cols: 3,
  rows: 3,
  widths: 2,
  ground: false,
  tintable: false,
};

describe('a flipbook', () => {
  it('plays at the video’s 30 fps and is over after its last frame', () => {
    expect(flipbookFrame(meta, 0)).toBe(0);
    expect(flipbookFrame(meta, 1 / 30 + 1e-6)).toBe(1);
    expect(flipbookFrame(meta, 6.5 / 30)).toBe(6);
    expect(flipbookFrame(meta, 7 / 30 + 1e-6)).toBeUndefined();
  });

  it('a loop starts over', () => {
    expect(flipbookFrame({ ...meta, loop: true }, 8 / 30 + 1e-6)).toBe(1);
  });

  it('reads its frames row by row from the top of the atlas', () => {
    const near = (k: number, x: number, y: number) => {
      expect(frameOffset(meta, k).x).toBeCloseTo(x, 9);
      expect(frameOffset(meta, k).y).toBeCloseTo(y, 9);
    };
    near(0, 0, 2 / 3);
    near(4, 1 / 3, 1 / 3);
    near(6, 0, 0);
  });
});
