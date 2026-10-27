import * as THREE from 'three';
import { ICE_MOTION, chunkSpot, chunksOpacity } from '../iceMotion';
import { ICE_LOOK } from '../iceLook';

/**
 * The ice block breaking (ICE_BOOMERANG thawed): pale cubes of it thrown out from where it stood, arcing down onto the ground and
 * lying there until they fade (the HQ: ff physics hq 2.mp4 6:46.95-6:47.5, foomerang-fu physics hq.mp4 6:57.62; iceMotion.ts:
 * where each lands, when they go). One instanced mesh for every break at once.
 */
export class IceShards {
  readonly #mesh: THREE.InstancedMesh;
  readonly #breaks: { readonly at: THREE.Vector3; readonly w: number; readonly born: number }[] =
    [];
  readonly #m = new THREE.Matrix4();
  readonly #q = new THREE.Quaternion();
  readonly #e = new THREE.Euler();
  static readonly capacity = 64;

  constructor(scene: THREE.Scene) {
    this.#mesh = new THREE.InstancedMesh(
      iceBlockGeometry(),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        vertexColors: true,
        transparent: true,
        opacity: ICE_LOOK.blockOpacity,
        depthWrite: false,
      }),
      IceShards.capacity,
    );
    this.#mesh.count = 0;
    this.#mesh.frustumCulled = false;
    scene.add(this.#mesh);
  }

  /** The block at `at` (its feet) breaks at `now`; `w` one character width. */
  burst(at: THREE.Vector3, w: number, now: number): void {
    this.#breaks.push({ at: at.clone(), w, born: now });
  }

  frame(now: number): void {
    let n = 0;
    for (let b = this.#breaks.length - 1; b >= 0; b -= 1) {
      const br = this.#breaks[b] as { at: THREE.Vector3; w: number; born: number };
      const t = (now - br.born) / 1000;
      const fade = chunksOpacity(t);
      if (t >= ICE_MOTION.chunksGoneSeconds) {
        this.#breaks.splice(b, 1);
        continue;
      }
      for (let i = 0; i < ICE_MOTION.chunks && n < IceShards.capacity; i += 1) {
        const spot = chunkSpot(i);
        // out to its spot in the first 0.25 s, from a body's height down to the ground in an arc
        const k = Math.min(1, t / 0.25);
        const up = (1 - k) * (1 - k) * 0.9 + Math.sin(k * Math.PI) * 0.25;
        const s = spot.size * br.w * (0.5 + 0.5 * fade);
        this.#e.set(i * 1.3 + k * 2, i * 2.1, i * 0.7 + k * 1.5);
        this.#m.compose(
          new THREE.Vector3(
            br.at.x + spot.x * br.w * k,
            br.at.y + up * br.w + s / 2,
            br.at.z + spot.z * br.w * k,
          ),
          this.#q.setFromEuler(this.#e),
          new THREE.Vector3(s, s, s),
        );
        this.#mesh.setMatrixAt(n, this.#m);
        n += 1;
      }
    }
    this.#mesh.count = n;
    this.#mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.#breaks.length = 0;
    this.#mesh.count = 0;
  }
}

/** A unit cube with softly rounded edges, its faces shaded by how much they face up (baked: the ice is unlit): the HQ's block
 * is lightest on top (#e5fdfd), its sides paler cyan (#b6fafb toward the edges). */
export function iceBlockGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1, 3, 3, 3);
  // round the corners: pull every vertex toward a smaller cube's surface, then out again by the round
  const p = g.getAttribute('position');
  const r = 0.12;
  const v = new THREE.Vector3();
  const inner = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 1) {
    v.fromBufferAttribute(p, i);
    inner.set(
      THREE.MathUtils.clamp(v.x, -0.5 + r, 0.5 - r),
      THREE.MathUtils.clamp(v.y, -0.5 + r, 0.5 - r),
      THREE.MathUtils.clamp(v.z, -0.5 + r, 0.5 - r),
    );
    const out = v.clone().sub(inner);
    if (out.lengthSq() > 1e-9) v.copy(inner).add(out.normalize().multiplyScalar(r));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const n = g.getAttribute('normal');
  const top = new THREE.Color(ICE_LOOK.blockTop);
  const side = new THREE.Color(ICE_LOOK.block);
  const edge = new THREE.Color(ICE_LOOK.blockEdge);
  const colours = new Float32Array(n.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n.count; i += 1) {
    const up = n.getY(i);
    c.copy(up > 0.6 ? top : up < -0.6 ? edge : side);
    // (edges and corners, where the normal is not square to a face, paler cyan)
    const square = Math.max(Math.abs(n.getX(i)), Math.abs(up), Math.abs(n.getZ(i)));
    if (square < 0.95) c.lerp(edge, 0.6);
    colours.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return g;
}
