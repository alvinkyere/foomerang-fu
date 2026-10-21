import * as THREE from 'three';

/**
 * Dashing, as the store's full-HD shots draw it (the watermelon at ss06, the banana at ss01): overlapping see-through squares in
 * a light shade of its colour, turned about 45° and a little unevenly, ≈ 0.6 of its body across, laid along the way it dashed
 * and fading. Pooled: nothing is made while it plays.
 */
export const DASH_TRAIL = Object.freeze({
  /** A square every this many ms while it dashes, each fading out over `life` ms. */
  every: 25,
  life: 300,
  /** Its size, as a fraction of the body's height; how see-through it starts; how light its shade. */
  size: 0.6,
  opacity: 0.45,
  lighten: 0.35,
});

const POOL = 14;

interface Square {
  readonly mesh: THREE.Mesh;
  born: number;
  turn: number;
}

export class DashTrail {
  readonly #squares: Square[] = [];
  readonly #material: THREE.MeshBasicMaterial;
  #last = -Infinity;
  #next = 0;
  #seed = 1;

  constructor(scene: THREE.Scene, colour: THREE.Color) {
    this.#material = new THREE.MeshBasicMaterial({
      color: colour.clone().lerp(new THREE.Color(1, 1, 1), DASH_TRAIL.lighten),
      transparent: true,
      depthWrite: false,
    });
    const plane = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < POOL; i += 1) {
      const mesh = new THREE.Mesh(plane, this.#material.clone());
      mesh.visible = false;
      mesh.renderOrder = 1;
      scene.add(mesh);
      this.#squares.push({ mesh, born: -Infinity, turn: 0 });
    }
  }

  /** Each frame: while `dashing`, leaves a square at `centre` (scene) now and then; fades the ones it left. */
  update(
    dashing: boolean,
    centre: THREE.Vector3,
    body: number,
    cam: THREE.Camera,
    now: number,
  ): void {
    if (dashing && now - this.#last >= DASH_TRAIL.every) {
      this.#last = now;
      const sq = this.#squares[this.#next] as Square;
      this.#next = (this.#next + 1) % POOL;
      // a little uneven: 45° give or take ≈ 15° (a fixed sequence, so it looks the same every time)
      this.#seed = (this.#seed * 16807) % 2147483647;
      sq.turn = Math.PI / 4 + ((this.#seed / 2147483647) * 2 - 1) * (Math.PI / 12);
      sq.born = now;
      sq.mesh.position.copy(centre);
      sq.mesh.scale.setScalar(body * DASH_TRAIL.size);
    }
    for (const sq of this.#squares) {
      const age = now - sq.born;
      const live = age >= 0 && age < DASH_TRAIL.life;
      sq.mesh.visible = live;
      if (!live) continue;
      sq.mesh.quaternion.copy(cam.quaternion);
      sq.mesh.rotateZ(sq.turn);
      (sq.mesh.material as THREE.MeshBasicMaterial).opacity =
        DASH_TRAIL.opacity * (1 - age / DASH_TRAIL.life);
    }
  }

  destroy(scene: THREE.Scene): void {
    for (const sq of this.#squares) {
      scene.remove(sq.mesh);
      (sq.mesh.material as THREE.Material).dispose();
    }
    this.#squares[0]?.mesh.geometry.dispose();
    this.#material.dispose();
  }
}
