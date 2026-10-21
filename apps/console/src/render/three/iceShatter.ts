import * as THREE from 'three';
import { ICE_LOOK } from '../iceLook';
import { ICE_MOTION, chunkSpot, chunksOpacity, puffAt } from '../iceMotion';

/** Where the ice broke (render/iceMotion.ts): a white frost puff, and pale chunks lying flat in the block's footprint. */
interface Shatter {
  readonly root: THREE.Group;
  readonly puff: THREE.Mesh;
  readonly chunks: THREE.Mesh[];
  readonly born: number;
  readonly w: number;
}

export class IceShatters {
  readonly #live: Shatter[] = [];
  readonly #disc = new THREE.CircleGeometry(0.5, 24).rotateX(-Math.PI / 2);
  readonly #chunk = new THREE.CircleGeometry(0.5, 5).rotateX(-Math.PI / 2);

  constructor(readonly scene: THREE.Scene) {}

  /** The ice broke at (x, z) on the ground; `w` is one character width in scene units. */
  shatter(x: number, z: number, w: number, now: number): void {
    const root = new THREE.Group();
    root.position.set(x, 0.15, z);
    const puff = new THREE.Mesh(
      this.#disc,
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false }),
    );
    puff.position.y = 0.3 * w;
    const chunks = Array.from({ length: ICE_MOTION.chunks }, (_, i) => {
      const c = chunkSpot(i);
      const m = new THREE.Mesh(
        this.#chunk,
        new THREE.MeshBasicMaterial({
          color: ICE_LOOK.block,
          transparent: true,
          depthWrite: false,
        }),
      );
      m.position.set(c.x * w, 0, c.z * w);
      m.rotation.y = i * 1.3;
      m.scale.setScalar(c.size * w);
      return m;
    });
    root.add(puff, ...chunks);
    this.scene.add(root);
    this.#live.push({ root, puff, chunks, born: now, w });
  }

  frame(now: number): void {
    for (let k = this.#live.length - 1; k >= 0; k -= 1) {
      const s = this.#live[k] as Shatter;
      const t = (now - s.born) / 1000;
      if (t >= ICE_MOTION.chunksGoneSeconds) {
        this.scene.remove(s.root);
        for (const o of [s.puff, ...s.chunks]) (o.material as THREE.Material).dispose();
        this.#live.splice(k, 1);
        continue;
      }
      const p = puffAt(t);
      s.puff.visible = p !== undefined;
      if (p !== undefined) {
        s.puff.scale.setScalar(p.size * s.w);
        (s.puff.material as THREE.MeshBasicMaterial).opacity = p.opacity;
      }
      const o = chunksOpacity(t);
      for (const c of s.chunks) (c.material as THREE.MeshBasicMaterial).opacity = 0.9 * o;
    }
  }

  get count(): number {
    return this.#live.length;
  }
}
