import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { canalWaterMaterial, parseCanalWater } from '../src/render/three/canalWater';

// The canal court's three waters (foomerang-fu physics hq.mp4 10:55): the tower's pool (deep blue, a pale foam boiling up in its
// middle), the channel's run (a pale stream, darker streaks flowing down it), the basin (pale, darker bands drifting round its octagon).
// Each is a mesh of the map's model, FLOW_<kind>; where each lies comes from the map's manifest (`canalWater`): checked, not trusted.

const spec = {
  yc: 73.72,
  pool: { cx: -9.9, cy: 6.0, r: 2.3 },
  run: {
    line: [
      [-9.9, 6],
      [-9, -1.5],
      [-4.6, -4.8],
      [8.8, -2.7],
    ],
    halfWidth: 0.45,
    speed: 1.5,
  },
  basin: { cx: 13, cy: -2.6, r: 3.3, turn: 0.08 },
};

describe('the canal court’s water', () => {
  it('reads its places from the manifest, and nothing from a manifest without them or with bad ones', () => {
    const w = parseCanalWater({ canalWater: spec });
    expect(w?.run.line).toHaveLength(4);
    expect(parseCanalWater({})).toBeUndefined();
    expect(parseCanalWater({ canalWater: { ...spec, pool: { cx: 'x' } } })).toBeUndefined();
    expect(
      parseCanalWater({ canalWater: { ...spec, run: { ...spec.run, line: [] } } }),
    ).toBeUndefined();
    // (a line longer than the shader holds is refused, not cut)
    const long = Array.from({ length: 20 }, (_, i) => [i, 0]);
    expect(
      parseCanalWater({ canalWater: { ...spec, run: { ...spec.run, line: long } } }),
    ).toBeUndefined();
  });

  it('draws each kind with its own shader, run by a time uniform', () => {
    const w = parseCanalWater({ canalWater: spec });
    if (w === undefined) throw new Error('spec refused');
    for (const kind of ['pool', 'run', 'basin'] as const) {
      const m = canalWaterMaterial(kind, w);
      expect(m).toBeInstanceOf(THREE.ShaderMaterial);
      expect(m.uniforms['time']).toBeDefined();
      expect(m.fragmentShader).toContain(`KIND_${kind.toUpperCase()}`);
    }
  });

  it('names no reserved GLSL word', () => {
    const w = parseCanalWater({ canalWater: spec });
    if (w === undefined) throw new Error('spec refused');
    for (const kind of ['pool', 'run', 'basin'] as const) {
      const code = canalWaterMaterial(kind, w).fragmentShader.replace(/\/\/.*$/gm, '');
      for (const word of ['half', 'fixed', 'long', 'short', 'double', 'input', 'output'])
        expect(code, word).not.toMatch(new RegExp(`\\b(float|vec2|vec3|vec4|int)\\s+${word}\\b`));
    }
  });
});
