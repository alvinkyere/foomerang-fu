import * as THREE from 'three';

/** Characters are drawn after the floor and the models (their sprites' render order). */
export const CHARACTER_RENDER_ORDER = 2;

/**
 * Our vector floor (art/reconstruction/environ2/blender/floor_vector.py): one crisp flat-coloured ground, top-down, spanning
 * `extent` (scene units, z = -y). A character is a flat picture facing the camera, so all of it lies at the depth of the point
 * it stands on and the floor in front of that point is nearer the camera: tested against the floor's depth, the lower part of
 * every body vanished into the ground. The floor is under everything, so it is drawn first and keeps no depth.
 */
export function plazaFloor(
  texture: THREE.Texture | null,
  extent: { x0: number; x1: number; y0: number; y1: number },
): THREE.Mesh {
  const { x0, x1, y0, y1 } = extent;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(x1 - x0, y1 - y0).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: texture, depthWrite: false }),
  );
  ground.position.set((x0 + x1) / 2, 0, -(y0 + y1) / 2);
  ground.renderOrder = -10;
  ground.name = 'FLOOR_vector';
  return ground;
}
