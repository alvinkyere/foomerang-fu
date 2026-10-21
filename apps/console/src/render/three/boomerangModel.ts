import * as THREE from 'three';
import { boomerangMesh } from '../boomerangShape';

let shared:
  | { mesh: ReturnType<typeof boomerangMesh>; geometries: Map<number, THREE.BufferGeometry> }
  | undefined;

/**
 * The boomerang's 3D shape (render/boomerangShape.ts) at `unit` scene units per world unit: lying flat (thickness along +y), its
 * elbow towards +z. One geometry per scale, shared by every boomerang drawn at it (lying, flying or held).
 */
export function boomerangGeometry(unit: number): THREE.BufferGeometry {
  shared ??= { mesh: boomerangMesh(), geometries: new Map() };
  let g = shared.geometries.get(unit);
  if (g === undefined) {
    g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        shared.mesh.positions.map((v) => v * unit),
        3,
      ),
    );
    g.setIndex(shared.mesh.indices);
    g.computeVertexNormals();
    shared.geometries.set(unit, g);
  }
  return g;
}

/** A boomerang body: its shape in the thrower's colour, shaded as the plaza is. */
export function boomerangBody(
  unit: number,
  colour: THREE.Color,
  gradient: THREE.Texture,
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial> {
  const m = new THREE.Mesh(
    boomerangGeometry(unit),
    new THREE.MeshToonMaterial({ color: colour, gradientMap: gradient, transparent: true }),
  );
  m.castShadow = true;
  return m;
}
