import { describe, expect, it } from 'vitest';
import { beamStrength, beamsFragment, type LightBeams } from '../src/render/three/beams';

// The bridge islands' light beams (the HQ 1:12, top right): crisp slanting bands of cyan light ADDED over everything there, the long wall
// and the islets as well as the water (the lily island's shafts only touch the water). `stops` are [t, strength] along the bands' normal
// (frame pixels from the frame's centre), `fade` the screen heights where they are full and gone, `add` the light's colour per unit.
const BEAMS: LightBeams = {
  angle: 120,
  stops: [
    [-100, 0],
    [-90, 30],
    [-60, 30],
    [-50, 0],
  ],
  fade: [0.2, 0.4],
  add: [0.08, 1, 0.75],
};

describe('the light beams', () => {
  it('are as strong as their profile across the band, and nothing outside it', () => {
    const a = (120 * Math.PI) / 180;
    // the x where the band coordinate t has a given value on the row y
    const xFor = (t: number, y: number) => 960 + (t + (y - 540) * Math.cos(a)) / Math.sin(a);
    expect(beamStrength(BEAMS, xFor(-75, 100), 100)).toBeCloseTo(30, 6);
    expect(beamStrength(BEAMS, xFor(-95, 100), 100)).toBeCloseTo(15, 6);
    expect(beamStrength(BEAMS, xFor(-40, 100), 100)).toBe(0);
    expect(beamStrength(BEAMS, 1900, 100)).toBe(0);
  });

  it('fade out down the screen as the HQ’s do: full above `fade[0]`, gone below `fade[1]`', () => {
    const a = (120 * Math.PI) / 180;
    const xFor = (y: number) => 960 + (-75 + (y - 540) * Math.cos(a)) / Math.sin(a);
    expect(beamStrength(BEAMS, xFor(100), 100)).toBeCloseTo(30, 0);
    expect(beamStrength(BEAMS, xFor(1000), 1000)).toBe(0);
  });

  it('light only what lies beyond the wall: nothing below the `above` line (the HQ’s grass in front of the wall is unlit)', () => {
    const a = (120 * Math.PI) / 180;
    const xFor = (t: number, y: number) => 960 + (t + (y - 540) * Math.cos(a)) / Math.sin(a);
    const walled: LightBeams = {
      ...BEAMS,
      above: [
        [0, 150],
        [1920, 150],
      ],
    };
    expect(beamStrength(walled, xFor(-75, 100), 100)).toBeCloseTo(30, 6);
    expect(beamStrength(walled, xFor(-75, 200), 200)).toBe(0);
    expect(beamsFragment(walled)).toContain('150.0000');
  });

  it('are written as GLSL without reserved words (`half` killed a water shader silently once)', () => {
    const glsl = beamsFragment(BEAMS);
    expect(glsl).toContain('gl_FragColor');
    expect(glsl).not.toMatch(/\bhalf\b/);
  });
});
