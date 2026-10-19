import * as THREE from 'three';
import { BLAST_SECONDS, blastAt } from '../blastMotion';

interface Live {
  readonly at: THREE.Vector3;
  /** The blast radius (scene units). */
  readonly radius: number;
  readonly born: number;
  readonly group: THREE.Group;
  readonly puff: THREE.Mesh;
  readonly flash: THREE.Mesh;
  readonly ring: THREE.Mesh;
  readonly smoke: THREE.Mesh[];
}

const flat = (colour: string, segments = 40): THREE.Mesh =>
  new THREE.Mesh(
    new THREE.CircleGeometry(1, segments).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, depthWrite: false }),
  );

/**
 * Explosive boomerangs' blasts on the TV, moved by `render/blastMotion.ts` (the reference video's puff, flash, ring and smoke),
 * drawn on the ground at the blast radius the rules resolved.
 */
export class Blasts {
  readonly #live: Live[] = [];

  constructor(readonly scene: THREE.Scene) {}

  burst(at: THREE.Vector3, radius: number, now: number): void {
    const group = new THREE.Group();
    group.position.copy(at);
    const puff = flat('#ffffff');
    const flash = flat('#fdfd8c');
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
    );
    const smoke = [0, 1, 2].map(() => flat('#7a2a2e', 20));
    for (const m of [puff, flash, ring, ...smoke]) {
      m.renderOrder = 3;
      group.add(m);
    }
    this.scene.add(group);
    this.#live.push({ at, radius, born: now, group, puff, flash, ring, smoke });
    this.frame(now);
  }

  frame(now: number): void {
    for (let i = this.#live.length - 1; i >= 0; i -= 1) {
      const b = this.#live[i] as Live;
      const t = (now - b.born) / 1000;
      if (t >= BLAST_SECONDS) {
        this.#dispose(b);
        this.#live.splice(i, 1);
        continue;
      }
      const pose = blastAt(t);
      const R = b.radius;
      b.puff.visible = pose.puff !== undefined;
      if (pose.puff) b.puff.scale.setScalar(pose.puff.radius * R);
      b.flash.visible = pose.flash !== undefined;
      if (pose.flash) b.flash.scale.setScalar(pose.flash.radius * R);
      b.ring.visible = pose.ring !== undefined;
      if (pose.ring) {
        b.ring.geometry.dispose();
        b.ring.geometry = new THREE.RingGeometry(
          Math.max(0.001, pose.ring.inner * R),
          pose.ring.outer * R,
          64,
        ).rotateX(-Math.PI / 2);
        const m = b.ring.material as THREE.MeshBasicMaterial;
        m.color.set(pose.ring.colour);
        m.opacity = pose.ring.opacity;
      }
      b.smoke.forEach((mesh, k) => {
        const s = pose.smoke[k];
        mesh.visible = s !== undefined;
        if (s === undefined) return;
        mesh.position.set(s.x * R, 0.5, s.z * R);
        mesh.scale.setScalar(s.size * R);
        (mesh.material as THREE.MeshBasicMaterial).color.set(s.colour);
      });
    }
  }

  #dispose(b: Live): void {
    this.scene.remove(b.group);
    b.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
