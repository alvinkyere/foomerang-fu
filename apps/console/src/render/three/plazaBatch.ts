import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * How an object of the plaza is batched: `shared`, it never moves, fades or breaks, so it is merged with every other such
 * object; `own`, it moves or fades as a whole, so only its own parts are merged and it stays itself; `leave`, untouched.
 */
export type BatchKind = 'shared' | 'own' | 'leave';

/**
 * Draws the plaza in far fewer pieces. three.js pays a fixed cost for every mesh it draws, and the plaza model has ~780 of
 * them: a TV's browser spent most of each frame on that (9 FPS on a TV-like CPU). Parts that look the same (equal
 * material settings) are merged into one mesh, with every triangle exactly where it was and facing the same way. Call it
 * once, after the materials are final and before anything is drawn. `root`'s own children are the plaza's objects.
 */
export function batchPlaza(
  root: THREE.Object3D,
  kindOf: (object: THREE.Object3D) => BatchKind,
): void {
  root.updateMatrixWorld(true);
  const shared: THREE.Object3D[] = [];
  for (const object of [...root.children]) {
    const kind = kindOf(object);
    if (kind === 'own') mergeInto(object, partsOf(object, false));
    else if (kind === 'shared') shared.push(object);
  }
  if (shared.length === 0) return;
  const together = new THREE.Group();
  together.name = 'STATIC_batched';
  root.add(together);
  together.updateMatrixWorld(true);
  const parts = shared.flatMap((o) => partsOf(o, true));
  const left = mergeInto(together, parts);
  for (const mesh of left) together.attach(mesh); // anything that cannot be merged keeps its place in the world
  for (const o of shared) o.removeFromParent();
}

/** The meshes in `object` (itself included or not). */
function partsOf(object: THREE.Object3D, withSelf: boolean): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  object.traverse((o) => {
    if (o instanceof THREE.Mesh && (withSelf || o !== object)) found.push(o);
  });
  return found;
}

/** What makes two parts drawable as one: the same look and the same vertex layout. Undefined: never merged. */
function keyOf(mesh: THREE.Mesh): string | undefined {
  const m = mesh.material;
  const g = mesh.geometry;
  if (Array.isArray(m) || mesh.type !== 'Mesh' || Object.keys(g.morphAttributes).length > 0)
    return undefined;
  const look = m as THREE.Material & {
    color?: THREE.Color;
    emissive?: THREE.Color;
    map?: THREE.Texture | null;
    gradientMap?: THREE.Texture | null;
    roughness?: number;
    metalness?: number;
  };
  const layout = Object.entries(g.attributes)
    .map(([name, a]) => `${name}:${a.itemSize}:${a.normalized}`)
    .sort();
  return JSON.stringify([
    look.type,
    look.color?.getHex(),
    look.emissive?.getHex(),
    look.map?.uuid,
    look.gradientMap?.uuid,
    look.roughness,
    look.metalness,
    look.side,
    look.transparent,
    look.opacity,
    look.vertexColors,
    look.alphaTest,
    mesh.renderOrder,
    mesh.castShadow,
    mesh.receiveShadow,
    g.index !== null,
    layout,
  ]);
}

/** Merges `parts` by look into new meshes under `target` and removes them; returns the parts that cannot be merged. */
function mergeInto(target: THREE.Object3D, parts: readonly THREE.Mesh[]): THREE.Mesh[] {
  const toTarget = target.matrixWorld.clone().invert();
  const groups = new Map<string, THREE.Mesh[]>();
  const left: THREE.Mesh[] = [];
  for (const mesh of parts) {
    const key = keyOf(mesh);
    if (key === undefined) left.push(mesh);
    else groups.set(key, [...(groups.get(key) ?? []), mesh]);
  }
  let n = 0;
  for (const group of groups.values()) {
    const geometries = group.map((mesh) => {
      const local = new THREE.Matrix4().multiplyMatrices(toTarget, mesh.matrixWorld);
      const g = mesh.geometry.clone().applyMatrix4(local);
      if (local.determinant() < 0) flipWinding(g); // a mirrored part: keep its triangles facing out
      g.clearGroups();
      return g;
    });
    const merged = mergeGeometries(geometries);
    const first = group[0];
    if (merged === null || first === undefined) {
      left.push(...group);
      continue;
    }
    const mesh = new THREE.Mesh(merged, first.material);
    mesh.name = `${target.name}_batch${n++}`;
    mesh.renderOrder = first.renderOrder;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    target.add(mesh);
    for (const part of group) remove(part);
  }
  return left;
}

/** Takes a merged part out, keeping whatever hangs below it (in place). */
function remove(part: THREE.Mesh): void {
  const parent = part.parent;
  if (parent === null) return;
  if (part.children.length > 0) {
    const stand = new THREE.Object3D();
    stand.name = part.name;
    stand.position.copy(part.position);
    stand.quaternion.copy(part.quaternion);
    stand.scale.copy(part.scale);
    for (const child of [...part.children]) stand.add(child);
    parent.add(stand);
  }
  part.removeFromParent();
}

/** Reverses every triangle's corner order (its second and third corners swap). */
function flipWinding(g: THREE.BufferGeometry): void {
  const index = g.getIndex();
  if (index !== null) {
    for (let i = 0; i + 2 < index.count; i += 3) {
      const b = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, b);
    }
    return;
  }
  for (const a of Object.values(g.attributes)) {
    for (let i = 0; i + 2 < a.count; i += 3)
      for (let c = 0; c < a.itemSize; c += 1) {
        const b = a.getComponent(i + 1, c);
        a.setComponent(i + 1, c, a.getComponent(i + 2, c));
        a.setComponent(i + 2, c, b);
      }
  }
}
