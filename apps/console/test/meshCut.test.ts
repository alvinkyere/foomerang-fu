import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cutGeometry } from '../src/render/three/meshCut';

// A killed character is cut in two in 3D, as the HQs show it (the eggplant at HQ1 2:03.4: the top flies off along the hit, the
// bottom stands showing a flat pale cut face). The cut splits every triangle across the plane and closes each half with a flat
// cap (its own material group), so the pieces are solid from every side as they tumble.

const volume = (g: THREE.BufferGeometry): number => {
  // the signed volume of a closed triangle mesh (divergence theorem)
  const p = g.getAttribute('position');
  let v = 0;
  for (let i = 0; i < p.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i);
    const b = new THREE.Vector3().fromBufferAttribute(p, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
    v += a.dot(b.clone().cross(c)) / 6;
  }
  return v;
};

const box = (): THREE.BufferGeometry => {
  const g = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
  g.clearGroups(); // one material (a box has one group per side)
  return g;
};

describe('cutting a mesh in two', () => {
  it('splits a box across a plane into two closed halves whose volumes add up', () => {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5); // y = 0.5
    const { above, below } = cutGeometry(box(), plane);
    expect(volume(above)).toBeCloseTo(2 * 2 * 0.5, 5);
    expect(volume(below)).toBeCloseTo(2 * 2 * 1.5, 5);
  });

  it('keeps every point of each half on its own side of the plane', () => {
    const plane = new THREE.Plane(new THREE.Vector3(1, 1, 0).normalize(), -0.2);
    const { above, below } = cutGeometry(box(), plane);
    const side = (g: THREE.BufferGeometry, s: 1 | -1): boolean => {
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i += 1)
        if (s * plane.distanceToPoint(new THREE.Vector3().fromBufferAttribute(p, i)) < -1e-6)
          return false;
      return true;
    };
    expect(side(above, 1)).toBe(true);
    expect(side(below, -1)).toBe(true);
    expect(volume(above) + volume(below)).toBeCloseTo(8, 5);
  });

  it('puts the cap in its own group (material 1), lying in the plane and facing out of its half', () => {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const { above, below } = cutGeometry(box(), plane);
    for (const [g, out] of [
      [above, -1],
      [below, 1],
    ] as const) {
      const found = g.groups.find((x) => x.materialIndex === 1);
      expect(found).toBeDefined();
      const cap = found ?? { start: 0, count: 0 };
      const p = g.getAttribute('position');
      const n = g.getAttribute('normal');
      for (let i = cap.start; i < cap.start + cap.count; i += 1) {
        expect(Math.abs(p.getY(i))).toBeLessThan(1e-6);
        expect(n.getY(i)).toBeCloseTo(out, 6);
      }
      // the cap covers the box's whole 2 x 2 cross-section
      let area = 0;
      for (let i = cap.start; i < cap.start + cap.count; i += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(p, i);
        const b = new THREE.Vector3().fromBufferAttribute(p, i + 1);
        const c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
        area += b.sub(a).cross(c.sub(a)).length() / 2;
      }
      expect(area).toBeCloseTo(4, 5);
    }
  });

  it('carries the texture coordinates across the cut (interpolated where a triangle is split)', () => {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const { above } = cutGeometry(box(), plane);
    const uv = above.getAttribute('uv');
    expect(uv).toBeDefined();
    const surface = above.groups.find((x) => x.materialIndex === 0) ?? { start: 0, count: 0 };
    expect(surface.count).toBeGreaterThan(0);
    for (let i = surface.start; i < surface.start + surface.count; i += 1) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(-1e-6);
      expect(uv.getX(i)).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it('keeps each surface material in its own group, the cap after them', () => {
    const { below, capMaterial } = cutGeometry(
      new THREE.BoxGeometry(2, 2, 2).toNonIndexed(),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    );
    expect(capMaterial).toBe(6);
    expect(below.groups.map((x) => x.materialIndex)).toEqual([0, 1, 3, 4, 5, 6]);
  });

  it('leaves a part wholly on one side untouched (no cap)', () => {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -5); // y = 5, above the box
    const { above, below } = cutGeometry(box(), plane);
    expect(above.getAttribute('position').count).toBe(0);
    expect(below.getAttribute('position').count).toBe(36);
    expect(below.groups.find((x) => x.materialIndex === 1)?.count ?? 0).toBe(0);
  });

  it('closes a ring cut across both of its sides with two caps', () => {
    // a torus standing up (as the donut does): a horizontal cut through its middle crosses it twice
    const ring = new THREE.TorusGeometry(1, 0.35, 16, 48).toNonIndexed();
    const { above, below } = cutGeometry(ring, new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
    const whole = volume(ring);
    expect(volume(above) + volume(below)).toBeCloseTo(whole, 3);
    expect(volume(above)).toBeCloseTo(whole / 2, 3);
  });
});
