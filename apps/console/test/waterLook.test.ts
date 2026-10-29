import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { waterMaterial } from '../src/render/three/waterShader';
import { WATER_GLSL, WATER_LOOK, waterAt, waterGlsl } from '../src/render/waterLook';

// The fountain's water as the reference video shows it (art/physics_reference/README.md, "The water"): not a flat disc. A pale
// glow hugs every edge, the basin's wall and the shell island alike; thin light foam lines are born at each edge and drift
// slowly away from it (≈ 0.06 units a second), fading, broken into pieces. `d` is how far a spot is from its nearest edge
// (scene units), `piece` the noise that breaks the lines (0…1), `t` seconds.

const foamAt = (d: number, t: number) => waterAt(d, 1, t).foam;

describe('the fountain’s water', () => {
  it('glows pale where it meets an edge, and is its own blue away from them', () => {
    expect(waterAt(0, 0, 0).glow).toBeCloseTo(1, 9);
    expect(waterAt(WATER_LOOK.glowWidth / 2, 0, 0).glow).toBeGreaterThan(0.3);
    expect(waterAt(WATER_LOOK.glowWidth, 0, 0).glow).toBe(0);
    expect(waterAt(1.5, 1, 3).glow).toBe(0);
    expect(waterAt(1.5, 1, 3).foam).toBe(0);
  });

  it('its colours are environ2’s: the water, and its light by the edges', () => {
    expect(WATER_LOOK.base).toBe('#78d2e7');
    expect(WATER_LOOK.light).toBe('#a9e6ec');
  });

  it('a foam line follows an edge at a distance, and drifts away from it as the video’s do', () => {
    // where the line is now, and a second later
    const peak = (t: number) => {
      let best = 0;
      let at = 0;
      for (let d = 0.12; d < 0.12 + WATER_LOOK.foamSpacing; d += 0.002) {
        const f = foamAt(d, t);
        if (f > best) [best, at] = [f, d];
      }
      return at;
    };
    const now = peak(10);
    const later = peak(11);
    expect(later - now).toBeCloseTo(WATER_LOOK.drift, 2);
    expect(WATER_LOOK.drift).toBeCloseTo(0.06, 2);
  });

  it('a line is thin: between lines the water is clear', () => {
    let lit = 0;
    const n = 400;
    for (let i = 0; i < n; i += 1)
      if (foamAt(0.15 + (i / n) * WATER_LOOK.foamSpacing, 4) > 0.5) lit += 1; // (a line at 0.24)
    expect(lit / n).toBeGreaterThan(0.02);
    expect(lit / n).toBeLessThan(0.25);
  });

  it('fades as it drifts out, and is gone before the middle of the open water', () => {
    const strongest = (from: number) => {
      let m = 0;
      for (let t = 0; t < WATER_LOOK.foamSpacing / WATER_LOOK.drift; t += 0.05)
        m = Math.max(m, foamAt(from, t));
      return m;
    };
    expect(strongest(0.3)).toBeGreaterThan(strongest(0.7));
    expect(strongest(WATER_LOOK.foamReach)).toBe(0);
  });

  it('is broken into pieces: where the noise is low there is no foam', () => {
    let best = 0;
    for (let d = 0.15; d < 0.6; d += 0.002) best = Math.max(best, waterAt(d, 0.1, 4).foam);
    expect(best).toBe(0);
  });
});

describe('a map’s own water shape (the cross pond: wider ribbons, reaching further from the bank)', () => {
  it('the fountain’s shader is unchanged by default, and a map’s shape is written into its own', () => {
    expect(waterGlsl()).toBe(WATER_GLSL);
    const pond = waterGlsl({ ...WATER_LOOK, foamWidth: 0.16, foamSpacing: 1, foamReach: 1.15 });
    expect(pond).not.toBe(WATER_GLSL);
    expect(pond).toContain('0.1600');
    expect(pond).toContain('1.1500');
    expect(WATER_GLSL).toContain('0.0400'); // (the fountain’s thin line)
  });
});

describe('the water shader of a map with a moving raft', () => {
  const pond = {
    base: '#74a2b3',
    light: '#9bc5d1',
    foam: '#a8deeb',
    raft: { halfArm: 14.5, halfWidth: 4.45 },
  };
  const material = waterMaterial(new THREE.Texture(), { x: 0, z: 0, half: 40 }, 2, pond);

  it('takes the raft’s place and facing as uniforms, so the foam gathers round wherever it has turned to', () => {
    expect(material.uniforms['raftAt']).toBeDefined();
    expect(material.uniforms['raftHalf']).toBeDefined();
    expect(material.fragmentShader).toContain('boxDistance');
  });

  const cartoon = waterMaterial(new THREE.Texture(), { x: 0, z: 0, half: 40 }, 2, {
    ...pond,
    cartoon: {
      fps: 1.5,
      wobble: 0.3,
      scale: 1.5,
      wobbleScale: 1.3,
      presence: [0.28, 0.55],
      raftFoam: { width: 0.35, presenceShift: 0.12 },
      motion: 1.6,
      glow: 0.3,
      ribbons: [
        { centre: 0.42, width: 0.34, sway: 0.1 },
        { centre: 1.05, width: 0.2, sway: 0.15 },
      ],
    },
  });

  it('draws the cartoon water too: a ribbon for each entry, its outline morphing from one draw to the next', () => {
    expect(cartoon.fragmentShader).toContain('floor(time * 1.5000)');
    // one line for each ribbon, in the function the banks and the raft each call (the raft with its own, thinner width)
    expect(cartoon.fragmentShader.match(/amount = max\(amount/g)).toHaveLength(2);
    expect(cartoon.fragmentShader).toContain('ribbons(uv, dBank, wobble, stepNo, ease, 1.0, 0.0)');
    expect(cartoon.fragmentShader).toContain(
      'ribbons(uv, dRaft, wobble, stepNo, ease, 0.3500, 0.1200)',
    );
  });

  it('names no reserved GLSL word (one did: `half`, and the whole water silently did not draw)', () => {
    // identifiers (not words in comments) that GLSL ES reserves
    for (const code of [material, cartoon].map((m) => m.fragmentShader.replace(/\/\/.*$/gm, '')))
      for (const word of [
        'half',
        'fixed',
        'long',
        'short',
        'double',
        'input',
        'output',
        'sampler3D',
      ])
        expect(code, word).not.toMatch(
          new RegExp(`\\b(float|vec2|vec3|vec4|int)\\s+${word}\\b|\\b${word}\\s*[,)=;]`),
        );
  });
});
