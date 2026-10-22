import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { batchPlaza, type BatchKind } from '../src/render/three/plazaBatch';

// The plaza was painfully slow on a TV (owner, 2026-10-19): it drew ~700 separate pieces a frame, and on a TV-like CPU
// (Chrome, 6x slower) three.js spent ~75% of the time setting each one up, for 9 FPS. Each object's parts are merged by
// material, and the objects that never move, fade or break are merged together, so far fewer pieces are drawn.

const meshes = (root: THREE.Object3D): THREE.Mesh[] => {
  const found: THREE.Mesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) found.push(o);
  });
  return found;
};

/**
 * Every triangle in world space, as sorted corner lists, with the way it faces as drawn: from its winding, reversed when
 * its mesh is mirrored (three.js draws a mirrored mesh's triangles the other way round).
 */
const triangles = (root: THREE.Object3D): string[] => {
  const out: string[] = [];
  for (const m of meshes(root)) {
    const g = m.geometry;
    const pos = g.getAttribute('position');
    const idx = g.getIndex();
    const n = idx ? idx.count : pos.count;
    const at = (i: number) =>
      new THREE.Vector3()
        .fromBufferAttribute(pos, idx ? idx.getX(i) : i)
        .applyMatrix4(m.matrixWorld);
    for (let i = 0; i < n; i += 3) {
      const [a, b, c] = [at(i), at(i + 1), at(i + 2)];
      const facing = new THREE.Vector3()
        .subVectors(b, a)
        .cross(new THREE.Vector3().subVectors(c, a));
      if (m.matrixWorld.determinant() < 0) facing.negate();
      const r = (v: THREE.Vector3) => [v.x, v.y, v.z].map((x) => x.toFixed(3)).join(',');
      out.push([[r(a), r(b), r(c)].sort().join('|'), r(facing.normalize())].join(' '));
    }
  }
  return out.sort();
};

const red = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const box = (material: THREE.Material, x: number, scaleX = 1) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  m.position.x = x;
  m.scale.x = scaleX;
  return m;
};

describe('batching the plaza', () => {
  it('merges an object’s parts that look the same into one, without moving a single triangle', () => {
    const scene = new THREE.Group();
    const stall = new THREE.Group();
    stall.name = 'stall_1';
    stall.position.set(5, 0, 2);
    stall.rotation.y = 0.4;
    const roof = box(red, 0);
    roof.add(box(red.clone(), 2)); // same look, separate material object (as the toon conversion makes them)
    stall.add(roof, box(new THREE.MeshStandardMaterial({ color: 0x00ff00 }), -2));
    scene.add(stall);
    const before = triangles(scene);
    batchPlaza(scene, () => 'own');
    expect(scene.children).toEqual([stall]); // the object itself stays, so it still fades and moves as one
    expect(meshes(stall)).toHaveLength(2); // red + green
    expect(triangles(scene)).toEqual(before);
  });

  it('keeps a mirrored part facing the same way', () => {
    const scene = new THREE.Group();
    const sign = new THREE.Group();
    sign.add(box(red, 0), box(red, 3, -1));
    scene.add(sign);
    const before = triangles(scene);
    batchPlaza(scene, () => 'own');
    expect(meshes(sign)).toHaveLength(1);
    expect(triangles(scene)).toEqual(before);
  });

  it('merges every object that never moves, fades or breaks together, and leaves the others alone', () => {
    const scene = new THREE.Group();
    const wallA = box(red, 0);
    const wallB = box(red, 4);
    const crate = box(red, 8);
    for (const [o, name] of [
      [wallA, 'WALL_a'],
      [wallB, 'WALL_b'],
      [crate, 'CRATE_1'],
    ] as const)
      o.name = name;
    scene.add(wallA, wallB, crate);
    const before = triangles(scene);
    batchPlaza(scene, (root) => (root.name.startsWith('CRATE') ? 'leave' : 'shared'));
    expect(scene.children).toContain(crate);
    expect(meshes(scene)).toHaveLength(2); // the walls as one, the crate
    expect(triangles(scene)).toEqual(before);
  });

  it('draws the real plaza in far fewer pieces, every triangle where it was', async () => {
    const file = readFileSync(join(process.cwd(), 'public/maps/market_plaza/plaza.glb'));
    const bytes = new ArrayBuffer(file.byteLength); // this realm's ArrayBuffer, which the loader recognises
    new Uint8Array(bytes).set(file);
    // (the plaza carries textures, which Node cannot decode: its loader would wait for them for ever. Batching is about
    // geometry, so here every image loads at once as a blank stand-in)
    const load = THREE.ImageLoader.prototype.load;
    const created = URL.createObjectURL;
    URL.createObjectURL = () => 'blob:stand-in';
    THREE.ImageLoader.prototype.load = function (_url, onLoad) {
      const image = document.createElement('img');
      queueMicrotask(() => onLoad?.(image));
      return image;
    };
    const gltf = await new GLTFLoader().parseAsync(bytes, '').finally(() => {
      THREE.ImageLoader.prototype.load = load;
      URL.createObjectURL = created;
    });
    const kind = (root: THREE.Object3D): BatchKind =>
      /^(stall_|TREE|BUNTING|BANNER|SIGN)/.test(root.name)
        ? 'own'
        : /^(CRATE|POT)_|^FOUNTAIN_water$|^(FLOOR|RUG)/.test(root.name)
          ? 'leave'
          : 'shared';
    const before = meshes(gltf.scene).length;
    const tris = triangles(gltf.scene).length;
    batchPlaza(gltf.scene, kind);
    expect(before).toBeGreaterThan(750);
    expect(meshes(gltf.scene).length).toBeLessThan(450);
    expect(triangles(gltf.scene).length).toBe(tris);
  }, 30_000); // (it parses and walks the whole 7 MB plaza: ≈ 2 s alone, far longer beside the other suites)
});
