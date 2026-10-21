import * as THREE from 'three';
import { BOOMERANG_LOOK, trailOpacity } from '../boomerangLook';

/**
 * A charging player's aim (owner, 2026-10-19): a flat strip on the ground from their feet along where the throw would go, as long
 * as it would fly, in their character's colour, growing stronger as the charge fills. Presentation of rules facts only.
 */
export class AimLine {
  readonly mesh: THREE.Mesh;
  readonly #material: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.#material = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    // a unit strip lying flat, starting at its origin and pointing along +x
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0),
      this.#material,
    );
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** `from`: the feet (scene); `facing`: the rules' facing (world x, y); `length`, `width`: scene units. */
  show(
    from: { x: number; z: number },
    facing: { x: number; y: number },
    length: number,
    width: number,
    power: number,
    colour: THREE.Color,
  ): void {
    this.mesh.visible = true;
    this.mesh.position.set(from.x, 0.1, from.z);
    // world +y is scene +z
    this.mesh.rotation.set(0, -Math.atan2(facing.y, facing.x), 0);
    this.mesh.scale.set(length, 1, width);
    this.#material.color.copy(colour);
    this.#material.opacity = 0.3 + 0.4 * power;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  destroy(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.#material.dispose();
  }
}

const TRAIL_POINTS = 64;

/**
 * The trail behind a thrown boomerang, quick or charged, as the reference video draws it (render/boomerangLook.ts): a flat band
 * of constant width through where it has been, in the thrower's character colour (owner, 2026-10-19: a yellow banana's trail
 * is yellow), part see-through, each part fading evenly from the moment the boomerang passed it.
 */
export class Trail {
  readonly mesh: THREE.Mesh;
  readonly #points: { x: number; y: number; z: number; t: number }[] = [];
  readonly #positions = new Float32Array(TRAIL_POINTS * 2 * 3);
  readonly #colours = new Float32Array(TRAIL_POINTS * 2 * 4);
  readonly #colour: THREE.Color;

  constructor(
    scene: THREE.Scene,
    readonly width: number,
    colour: THREE.Color,
  ) {
    this.#colour = colour.clone();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.#positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.#colours, 4));
    const index: number[] = [];
    for (let i = 0; i < TRAIL_POINTS - 1; i += 1) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geometry.setIndex(index);
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  /** Where the boomerang is now (scene), at `now` ms. */
  add(p: { x: number; y: number; z: number }, now: number): void {
    const last = this.#points.at(-1);
    if (last !== undefined && Math.hypot(last.x - p.x, last.z - p.z) < 1e-4) return;
    this.#points.push({ ...p, t: now });
    if (this.#points.length > TRAIL_POINTS) this.#points.shift();
  }

  /** Rebuilds the band from the points younger than the trail's life, each as opaque as its age allows; hidden with fewer than two. */
  update(now: number): void {
    const life = BOOMERANG_LOOK.trail.seconds * 1000;
    while (this.#points.length > 0 && now - (this.#points[0]?.t ?? now) >= life)
      this.#points.shift();
    const pts = this.#points;
    this.mesh.visible = pts.length >= 2;
    if (!this.mesh.visible) return;
    const { r, g, b } = this.#colour;
    for (let i = 0; i < TRAIL_POINTS; i += 1) {
      const k = Math.min(i, pts.length - 1);
      const p = pts[k] as { x: number; y: number; z: number; t: number };
      const q = pts[Math.min(k + 1, pts.length - 1)] as typeof p;
      const o = pts[Math.max(k - 1, 0)] as typeof p;
      const dx = q.x - o.x;
      const dz = q.z - o.z;
      const len = Math.hypot(dx, dz) || 1;
      // across the path, the same width all along (the video's band does not narrow: it fades)
      const w = this.width / 2;
      const nx = (-dz / len) * w;
      const nz = (dx / len) * w;
      this.#positions.set([p.x + nx, p.y, p.z + nz, p.x - nx, p.y, p.z - nz], i * 6);
      const a = i < pts.length ? trailOpacity((now - p.t) / 1000) : 0;
      this.#colours.set([r, g, b, a, r, g, b, a], i * 8);
    }
    const geometry = this.mesh.geometry;
    (geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.#points.length = 0;
    this.mesh.visible = false;
  }

  destroy(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
