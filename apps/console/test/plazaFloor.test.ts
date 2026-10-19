import { describe, expect, it } from 'vitest';
import { plazaFloor, CHARACTER_RENDER_ORDER } from '../src/render/three/plazaFloor';

// The players were sinking into the plaza (owner, 2026-10-19). A character is a flat picture facing the camera, so all of it
// lies at the depth of the point it stands on, and the floor in front of that point is nearer the camera: tested against the
// floor's depth, the lower part of the body (about a fifth of it, more mid-dash) vanished into the ground. The floor is under
// everything, so it is drawn first and keeps no depth: whatever stands on it is drawn whole, and the models (stalls, crates)
// still hide a character behind them.

describe('the plaza floor', () => {
  const floor = plazaFloor(null, { x0: -100, x1: 100, y0: -50, y1: 50 });

  it('keeps no depth, so it never hides the feet of what stands on it', () => {
    const material = floor.material as { depthWrite: boolean };
    expect(material.depthWrite).toBe(false);
  });

  it('is drawn before the characters (and everything else)', () => {
    expect(floor.renderOrder).toBeLessThan(0);
    expect(floor.renderOrder).toBeLessThan(CHARACTER_RENDER_ORDER);
  });

  it('lies flat on the ground and spans the floor art’s extent', () => {
    expect(floor.position.y).toBe(0);
    expect(floor.position.x).toBeCloseTo(0, 9);
    expect(floor.position.z).toBeCloseTo(0, 9);
    floor.geometry.computeBoundingBox();
    const box = floor.geometry.boundingBox;
    expect(box?.max.x).toBeCloseTo(100, 9);
    expect(box?.max.z).toBeCloseTo(50, 9);
    expect(box?.max.y).toBeCloseTo(0, 9);
    expect(floor.name).toBe('FLOOR_vector');
  });
});
