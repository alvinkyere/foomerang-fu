import * as THREE from 'three';
import { GROUND_MOTION, markAt, type MarkKind } from '../groundMarkMotion';
import { flipbookFrame, type FlipbookMeta } from './flipbooks';

export type { MarkKind } from '../groundMarkMotion';

/**
 * What a fire or ice boomerang leaves on the ground as it flies, and what a burning player leaves as they run: blobs along the
 * path, each living the reference video's timeline (render/groundMarkMotion.ts: fire swells, burns yellow, orange, red or smoke,
 * and is gone in 1.7 s; ice lies as a solid band for 3 s, then breaks up). Presentation only: the rules know nothing of it.
 * One instanced mesh per kind (per-blob colour and opacity), so a solid band of hundreds of blobs is two draw calls on a TV.
 */
export const GROUND_MARK = Object.freeze({
  fire: Object.freeze({
    lifeMs: GROUND_MOTION.fire.lifeSeconds * 1000,
    everyMs: GROUND_MOTION.fire.everyMs,
  }),
  ice: Object.freeze({
    lifeMs: GROUND_MOTION.ice.lifeSeconds * 1000,
    everyMs: GROUND_MOTION.ice.everyMs,
  }),
  /** The most blobs of one kind on the ground at once (the oldest go first). */
  capacity: 4096,
});

interface Mark {
  readonly x: number;
  readonly z: number;
  readonly born: number;
  readonly seed: number;
  /** One character width, scene units. */
  readonly w: number;
}

/** A blob layer: an instanced flat disc with a per-instance colour and alpha. */
class Layer {
  readonly mesh: THREE.InstancedMesh;
  readonly marks: Mark[] = [];
  readonly #alpha: THREE.InstancedBufferAttribute;
  readonly #frame: THREE.InstancedBufferAttribute;
  /** The video's own patch of it, played on every blob (flipbooks.ts), once loaded. */
  flipbook: FlipbookMeta | undefined;
  readonly #m = new THREE.Matrix4();
  readonly #grid = { value: new THREE.Vector2(1, 1) };
  readonly #material: THREE.MeshBasicMaterial;
  readonly #c = new THREE.Color();

  constructor(
    scene: THREE.Scene,
    readonly kind: MarkKind,
    readonly y: number,
  ) {
    const geometry = new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2);
    this.#alpha = new THREE.InstancedBufferAttribute(new Float32Array(GROUND_MARK.capacity), 1);
    geometry.setAttribute('instanceAlpha', this.#alpha);
    this.#frame = new THREE.InstancedBufferAttribute(new Float32Array(GROUND_MARK.capacity), 1);
    geometry.setAttribute('instanceFrame', this.#frame);
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    material.onBeforeCompile = (shader) => {
      shader.uniforms['grid'] = this.#grid;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          'attribute float instanceAlpha;\nattribute float instanceFrame;\nuniform vec2 grid;\nvarying float vAlpha;\n#include <common>',
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = instanceAlpha;')
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
          #ifdef USE_MAP
            vMapUv = vec2((mod(instanceFrame, grid.x) + vMapUv.x) / grid.x,
                          1.0 - (floor(instanceFrame / grid.x) + 1.0 - vMapUv.y) / grid.y);
          #endif`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', 'varying float vAlpha;\n#include <common>')
        .replace(
          '#include <opaque_fragment>',
          '#include <opaque_fragment>\ngl_FragColor.a *= vAlpha;',
        );
    };
    this.#material = material;
    this.mesh = new THREE.InstancedMesh(geometry, material, GROUND_MARK.capacity);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(GROUND_MARK.capacity * 3),
      3,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  /** From now on every blob plays the video's own patch (`texture`: its atlas). */
  useFlipbook(texture: THREE.Texture, meta: FlipbookMeta): void {
    const t = texture.clone();
    t.repeat.set(1, 1);
    t.offset.set(0, 0);
    t.needsUpdate = true;
    this.#material.map = t;
    this.#material.needsUpdate = true;
    this.#grid.value.set(meta.cols, meta.rows);
    this.flipbook = meta;
  }

  add(mark: Mark): void {
    if (this.marks.length >= GROUND_MARK.capacity) this.marks.shift();
    this.marks.push(mark);
  }

  /** Applies every blob's timeline at `now`, dropping the gone ones. */
  update(now: number): void {
    let n = 0;
    const keep: Mark[] = [];
    for (const m of this.marks) {
      const fb = this.flipbook;
      if (fb !== undefined) {
        const k = flipbookFrame(fb, (now - m.born) / 1000);
        if (k === undefined) continue;
        keep.push(m);
        const sz = fb.widths * m.w;
        // (each patch turned its own way, so a trail does not repeat)
        this.#m
          .makeRotationY(m.seed * Math.PI * 2)
          .scale(new THREE.Vector3(sz, 1, sz))
          .setPosition(m.x, this.y, m.z);
        this.mesh.setMatrixAt(n, this.#m);
        this.mesh.setColorAt(n, this.#c.set('#ffffff'));
        this.#alpha.setX(n, 1);
        this.#frame.setX(n, k);
        n += 1;
        continue;
      }
      const look = markAt(this.kind, (now - m.born) / 1000, m.seed);
      if (look === undefined) continue;
      keep.push(m);
      const s = Math.max(1e-3, look.size * m.w);
      this.#m.makeScale(s, 1, s).setPosition(m.x, this.y, m.z);
      this.mesh.setMatrixAt(n, this.#m);
      this.mesh.setColorAt(n, this.#c.set(look.colour));
      this.#alpha.setX(n, 0.95 * look.opacity);
      n += 1;
    }
    this.marks.length = 0;
    this.marks.push(...keep);
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor !== null) this.mesh.instanceColor.needsUpdate = true;
    this.#alpha.needsUpdate = true;
    this.#frame.needsUpdate = true;
  }
}

export class GroundMarks {
  readonly #layers: Readonly<Record<MarkKind, Layer>>;
  readonly #last = new Map<string, { x: number; z: number; t: number }>();
  #dropped = 0;

  constructor(readonly scene: THREE.Scene) {
    // (fire lies over ice)
    this.#layers = { ice: new Layer(scene, 'ice', 0.07), fire: new Layer(scene, 'fire', 0.09) };
  }

  /** `source` (a boomerang's or a player's id) is at (x, z) at `now`: blobs along its path since the last one, close enough to
   * read as the video's band (ice) or cluster (fire), at least every `everyMs`. `w`: one character width in scene units. */
  drop(source: string, kind: MarkKind, x: number, z: number, w: number, now: number): void {
    const motion = GROUND_MOTION[kind];
    // (the video's own patch is ≈ 0.9 W across: a stamp every third of one keeps the trail as solid as the video's)
    const fb = this.#layers[kind].flipbook;
    const step = fb !== undefined ? fb.widths * w * 0.33 : motion.size * motion.spacing * w;
    const last = this.#last.get(source);
    if (last === undefined || now - last.t > 250) {
      this.#one(kind, x, z, w, now);
      this.#last.set(source, { x, z, t: now });
      return;
    }
    const d = Math.hypot(x - last.x, z - last.z);
    if (d < step && now - last.t < motion.everyMs) return;
    const n = Math.max(1, Math.floor(d / step));
    for (let i = 1; i <= n; i += 1) {
      const k = i / n;
      this.#one(
        kind,
        last.x + (x - last.x) * k,
        last.z + (z - last.z) * k,
        w,
        last.t + (now - last.t) * k,
      );
    }
    this.#last.set(source, { x, z, t: now });
  }

  #one(kind: MarkKind, x: number, z: number, w: number, born: number): void {
    this.#dropped += 1;
    const seed = (((this.#dropped * 0.6180339887) % 1) + 1) % 1;
    // fire puffs sit a little about the path; ice is a band right along it
    const jitter = kind === 'fire' ? 0.12 * w : 0;
    this.#layers[kind].add({
      x: x + jitter * Math.cos(seed * 40),
      z: z + jitter * Math.sin(seed * 40),
      born,
      seed,
      w,
    });
  }

  /** The fire (or ice) blobs play the video's own patch from now on. */
  useFlipbook(kind: MarkKind, texture: THREE.Texture, meta: FlipbookMeta): void {
    this.#layers[kind].useFlipbook(texture, meta);
  }

  update(now: number): void {
    this.#layers.ice.update(now);
    this.#layers.fire.update(now);
  }

  /** How many blobs lie on the ground now (for tests and budgets). */
  get count(): number {
    return this.#layers.ice.marks.length + this.#layers.fire.marks.length;
  }

  clear(): void {
    this.#layers.ice.marks.length = 0;
    this.#layers.fire.marks.length = 0;
    this.#last.clear();
    this.update(0);
  }
}
