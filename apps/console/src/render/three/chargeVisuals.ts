import * as THREE from 'three';
import { AIM_LOOK, chevronDistance } from '../aimLook';
import { BOOMERANG_LOOK, trailOpacity } from '../boomerangLook';

/**
 * Charging a throw (render/aimLook.ts, the reference video at 2:00.60–2:01.47): an arrowhead in the thrower's colour lying flat
 * on the ground ahead of it, pointing where it aims, sliding out from its body as the charge builds. Presentation only.
 */
export class AimChevron {
  readonly group = new THREE.Group();
  readonly #material: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.#material = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    // two unit strokes lying flat, meeting at the tip (the origin) and opening back towards -x at a right angle
    for (const side of [-1, 1]) {
      const stroke = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(-0.5, 0, 0),
        this.#material,
      );
      stroke.rotation.y = side * (Math.PI / 4);
      this.group.add(stroke);
    }
    this.group.renderOrder = 1;
    this.group.visible = false;
    scene.add(this.group);
  }

  /** `feet`: the body's ground point (scene); `facing`: the rules' facing (world x, y); `unit`: scene units per world unit. */
  show(
    feet: { x: number; z: number },
    facing: { x: number; y: number },
    power: number,
    colour: THREE.Color,
    unit: number,
  ): void {
    const l = Math.hypot(facing.x, facing.y) || 1;
    const d = chevronDistance(power) * unit;
    // world +y is scene +z
    this.group.position.set(feet.x + (facing.x / l) * d, 0.12, feet.z + (facing.y / l) * d);
    this.group.rotation.set(0, -Math.atan2(facing.y, facing.x), 0);
    const len = (AIM_LOOK.size / Math.SQRT2) * unit;
    for (const stroke of this.group.children) stroke.scale.set(len, 1, AIM_LOOK.stroke * unit);
    this.#material.color.copy(colour);
    this.#material.opacity = AIM_LOOK.opacity;
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  destroy(scene: THREE.Scene): void {
    scene.remove(this.group);
    for (const c of this.group.children) (c as THREE.Mesh).geometry.dispose();
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
  // three vertices across: one edge, the middle, the other edge (a light band: strongest down its middle, soft at its edges)
  readonly #positions = new Float32Array(TRAIL_POINTS * 3 * 3);
  readonly #colours = new Float32Array(TRAIL_POINTS * 3 * 4);
  readonly #colour: THREE.Color;

  constructor(
    scene: THREE.Scene,
    readonly width: number,
    colour: THREE.Color,
  ) {
    // a light trail (the store's full-HD shots): its colour a little towards white
    this.#colour = colour.clone().lerp(new THREE.Color(1, 1, 1), 0.2);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.#positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.#colours, 4));
    const index: number[] = [];
    for (let i = 0; i < TRAIL_POINTS - 1; i += 1) {
      const a = i * 3;
      const b = a + 3;
      // edge-middle strip, then middle-edge strip
      index.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
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
      this.#positions.set([p.x + nx, p.y, p.z + nz, p.x, p.y, p.z, p.x - nx, p.y, p.z - nz], i * 9);
      const a = i < pts.length ? trailOpacity((now - p.t) / 1000) : 0;
      // its edges a quarter as strong as its middle: soft, not hard-edged
      this.#colours.set([r, g, b, a * 0.25, r, g, b, a, r, g, b, a * 0.25], i * 12);
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
