import * as THREE from 'three';

/**
 * What a fire or ice boomerang leaves on the ground as it flies, and what a burning player leaves as they run, as the reference
 * video shows it (art/physics_reference/README.md, "Fire boomerang", "Ice boomerang"): blobs on the ground along the path that
 * shrink and fade. Fire: yellow (sampled #f2c312–#fff241), gone ≈ 1.6 s after it is laid (9:57.7–9:59.3). Ice: cyan (#78e5ef),
 * still there 3.3 s later when the round ended (6:02.5–6:05.8). Presentation only: the rules know nothing of it.
 */
export const GROUND_MARK = Object.freeze({
  fire: Object.freeze({ colours: ['#f2c312', '#fbdf22', '#fff241'], lifeMs: 1600 }),
  ice: Object.freeze({ colours: ['#73deef', '#78e5ef', '#7ce5f5'], lifeMs: 3300 }),
  /** A blob is dropped at most this often per source, ms, and this far apart, scene units. */
  everyMs: 35,
});

export type MarkKind = 'fire' | 'ice';

interface Mark {
  readonly mesh: THREE.Mesh;
  readonly born: number;
  readonly life: number;
  readonly size: number;
}

export class GroundMarks {
  readonly #marks: Mark[] = [];
  readonly #last = new Map<string, number>();
  readonly #geometry = new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2);

  constructor(readonly scene: THREE.Scene) {}

  /** `source` (a boomerang's or a player's id) is at (x, z) at `now`: a blob there, if it is time for one. */
  drop(source: string, kind: MarkKind, x: number, z: number, size: number, now: number): void {
    const last = this.#last.get(source);
    if (last !== undefined && now - last < GROUND_MARK.everyMs) return;
    this.#last.set(source, now);
    const look = GROUND_MARK[kind];
    const colour = look.colours[this.#marks.length % look.colours.length] as string;
    const mesh = new THREE.Mesh(
      this.#geometry,
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, depthWrite: false }),
    );
    mesh.position.set(x, 0.07, z);
    mesh.scale.setScalar(size);
    mesh.renderOrder = 1;
    this.scene.add(mesh);
    this.#marks.push({ mesh, born: now, life: look.lifeMs, size });
  }

  update(now: number): void {
    for (let i = this.#marks.length - 1; i >= 0; i -= 1) {
      const m = this.#marks[i] as Mark;
      const t = (now - m.born) / m.life;
      if (t >= 1) {
        this.scene.remove(m.mesh);
        (m.mesh.material as THREE.Material).dispose();
        this.#marks.splice(i, 1);
        continue;
      }
      // it burns (or lies) at full size, then shrinks and fades over its last half
      const fade = t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5;
      m.mesh.scale.setScalar(m.size * (0.4 + 0.6 * fade));
      (m.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * fade;
    }
  }

  /** How many blobs lie on the ground now (for tests and budgets). */
  get count(): number {
    return this.#marks.length;
  }

  clear(): void {
    for (const m of this.#marks) this.scene.remove(m.mesh);
    this.#marks.length = 0;
    this.#last.clear();
  }
}
