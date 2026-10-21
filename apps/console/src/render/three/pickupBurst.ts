import * as THREE from 'three';
import { PICKUP_MOTION, confettiAt, confettiPiece, flashAt } from '../pickupMotion';

/**
 * The burst where a power Book is taken, as the reference video draws it (render/pickupMotion.ts): a white flash with thin
 * streaks in the power's colour, which become small capsules of confetti that fly out, land and shrink away.
 */
interface Burst {
  readonly root: THREE.Group;
  readonly flash: THREE.Mesh;
  readonly streaks: THREE.Mesh[];
  readonly pieces: THREE.Mesh[];
  readonly born: number;
  /** One character width, scene units. */
  readonly w: number;
}

export class PickupBursts {
  readonly #live: Burst[] = [];
  readonly #capsule = new THREE.CapsuleGeometry(0.5, 1, 2, 6).rotateZ(Math.PI / 2);
  readonly #disc = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  readonly #line = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

  constructor(readonly scene: THREE.Scene) {}

  /** A burst at (x, z) on the ground, in `colour`; `w` is one character width in scene units. */
  burst(x: number, z: number, colour: string, w: number, now: number): void {
    const m = PICKUP_MOTION;
    const root = new THREE.Group();
    root.position.set(x, 0.2, z);
    const mat = (c: THREE.ColorRepresentation) =>
      new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false });
    const flash = new THREE.Mesh(this.#disc, mat('#ffffff'));
    flash.scale.setScalar(m.flashRadius * w);
    const streaks = Array.from(
      { length: m.streaks },
      () => new THREE.Mesh(this.#line, mat(colour)),
    );
    const pieces = Array.from(
      { length: m.confetti },
      () => new THREE.Mesh(this.#capsule, mat(colour)),
    );
    root.add(flash, ...streaks, ...pieces);
    for (const o of root.children) o.visible = false;
    this.scene.add(root);
    this.#live.push({ root, flash, streaks, pieces, born: now, w });
  }

  frame(now: number): void {
    const m = PICKUP_MOTION;
    for (let k = this.#live.length - 1; k >= 0; k -= 1) {
      const b = this.#live[k] as Burst;
      const t = (now - b.born) / 1000;
      if (t >= m.goneAt) {
        this.scene.remove(b.root);
        for (const o of [b.flash, ...b.streaks, ...b.pieces])
          (o.material as THREE.Material).dispose();
        this.#live.splice(k, 1);
        continue;
      }
      const f = flashAt(t);
      b.flash.visible = f.on;
      b.streaks.forEach((s, i) => {
        s.visible = f.on;
        if (!f.on) return;
        const a = (i / m.streaks) * Math.PI * 2;
        const inner = m.streakFrom * b.w;
        const outer = f.streakOut * b.w;
        const mid = (inner + outer) / 2;
        s.position.set(Math.cos(a) * mid, 0.01, Math.sin(a) * mid);
        s.rotation.y = -a;
        s.scale.set(outer - inner, 1, 0.05 * b.w);
      });
      b.pieces.forEach((p, i) => {
        const at = confettiAt(i, t);
        p.visible = at !== undefined;
        if (at === undefined) return;
        const { angle } = confettiPiece(i);
        p.position.set(
          Math.cos(angle) * at.distance * b.w,
          0.02,
          Math.sin(angle) * at.distance * b.w,
        );
        p.rotation.y = -angle;
        const s = at.scale * b.w;
        p.scale.set((m.pieceLength * s) / 2, m.pieceWidth * s, m.pieceWidth * s); // (the capsule is 2 long, 1 wide)
        (p.material as THREE.MeshBasicMaterial).opacity = at.opacity;
      });
    }
  }

  /** How many bursts are playing (for tests). */
  get count(): number {
    return this.#live.length;
  }
}
