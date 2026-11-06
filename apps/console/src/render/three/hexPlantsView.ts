import * as THREE from 'three';
import { burnAt, PlantField, type FireSource, type PlantsData, type Pusher } from '../hexPlants';

/** The plants' measured look (ff physics hq 2.mp4 1202.0 s; art/hex_meadow/README.md, "The plants"). */
const LOOK = {
  /** A stem's half width, and its colour (the frame's stems, ~4-5 px wide). */
  stem: { radius: 0.07, colour: '#5cb98a' },
  /** A pad's thickness, its rim (the thin darker line where pads meet) and side, as fractions of its colour. */
  pad: { overlap: 1.08, thick: 0.07, rim: 0.93, rimShade: 0.86, side: 0.78, heart: 1.03 },
  /** The flower dot at a pad's middle (whitish pink, ~6 px across). */
  flower: { radius: 0.1, colour: '#ece3c8' },
  /** The pads' shadow on the ground: its colour, and where it falls per unit of height (measured: the shift that best lays the
   *  pads' footprints on the frame's shadow, (-0.75, +1.4) plan units for the 2.9 tall stems; the scene's z is the plan's -y). */
  shadow: { colour: '#a1d07d', perHeight: [-0.26, -0.48] as const },
  /** Flames per burning pad (blobs over it), and how much of a pad wide each is. */
  /** (the HQ's, 1206.9-1207.2: faceted balls, yellow #ffe62e, golden, orange over each burning pad; then dark brown-grey smoke
   *  balls with a red ember among them) */
  flames: {
    perPad: 3,
    size: 0.55,
    second: '#f3b625',
    third: '#ffe62e',
    smoke: ['#5e5450', '#6e5a52', '#8a3a22'],
  },
};

/** A flat-topped hexagon's corner k (0..5) at radius r, in the x-z plane. */
const corner = (k: number, r: number): [number, number] => {
  const a = (k * Math.PI) / 3;
  return [Math.cos(a) * r, Math.sin(a) * r];
};

/** One pad: a thin hexagonal plate, its top at y 0 (a lighter heart, a darker rim), its sides darker; colours multiply the shade. */
function padGeometry(s: number, turn: number, rimShade: number): THREE.BufferGeometry {
  const { thick, rim, side, heart } = LOOK.pad;
  const pos: number[] = [];
  const col: number[] = [];
  const tri = (a: number[], b: number[], c: number[], ka: number, kb: number, kc: number): void => {
    pos.push(...a, ...b, ...c);
    col.push(ka, ka, ka, kb, kb, kb, kc, kc, kc);
  };
  for (let k = 0; k < 6; k += 1) {
    const [ax, az] = corner(k, s * rim);
    const [bx, bz] = corner(k + 1, s * rim);
    const [Ax, Az] = corner(k, s);
    const [Bx, Bz] = corner(k + 1, s);
    // the top (wound to face up: three's front faces are counter-clockwise seen from +y, i.e. x then -z)
    tri([0, 0, 0], [bx, 0, bz], [ax, 0, az], heart, 1, 1);
    // the rim
    tri([ax, 0, az], [bx, 0, bz], [Bx, 0, Bz], 1, 1, rimShade);
    tri([ax, 0, az], [Bx, 0, Bz], [Ax, 0, Az], 1, rimShade, rimShade);
    // the side
    tri([Ax, 0, Az], [Bx, 0, Bz], [Bx, -thick, Bz], side, side, side);
    tri([Ax, 0, Az], [Bx, -thick, Bz], [Ax, -thick, Az], side, side, side);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.rotateY(-turn); // (a corner from +x to `turn` toward +z: three turns +x toward -z)
  return g;
}

function hexGeometry(s: number, turn: number): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(s, 6);
  g.rotateX(-Math.PI / 2);
  g.rotateY(-turn);
  return g;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * The hex meadow's plants on the TV (render/hexPlants.ts moves them): one instanced mesh each for the pads, their stems, their
 * flowers, their shadows and the flames, so ~1,000 plants cost five draws. Pushers and fires come from the view each frame
 * (ThreePlaza.ts); a new round grows them all back.
 */
export class HexPlantsView {
  readonly field: PlantField;
  readonly #pads: THREE.InstancedMesh;
  readonly #stems: THREE.InstancedMesh;
  readonly #flowers: THREE.InstancedMesh;
  readonly #shadows: THREE.InstancedMesh;
  readonly #flames: THREE.InstancedMesh;
  readonly #flowerOf: Int32Array;
  readonly #shade: THREE.Color[];
  /** Pads drawn away from rest last frame (to put back once they settle). */
  #drawnMoved = new Set<number>();
  readonly #m = new THREE.Matrix4();
  readonly #q = new THREE.Quaternion();
  readonly #v = new THREE.Vector3();
  readonly #p = new THREE.Vector3();
  readonly #sc = new THREE.Vector3();
  readonly #c = new THREE.Color();
  readonly #hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  #last = Number.NaN;
  #burnt = false;

  constructor(
    readonly scene: THREE.Scene,
    readonly data: PlantsData,
  ) {
    this.field = new PlantField(data);
    const n = data.pads.length;
    const flat = (colour?: string): THREE.MeshBasicMaterial =>
      new THREE.MeshBasicMaterial(
        colour === undefined ? { vertexColors: true } : { color: colour },
      );
    // (a pad a little wider than its cell: neighbours at their own heights overlap, as the HQ's do, and no ground shows between them)
    this.#pads = new THREE.InstancedMesh(
      padGeometry(data.s * LOOK.pad.overlap, data.turn ?? 0, data.rim ?? LOOK.pad.rimShade),
      flat(),
      n,
    );
    const stem = new THREE.CylinderGeometry(LOOK.stem.radius, LOOK.stem.radius, 1, 6, 1, true);
    stem.translate(0, 0.5, 0);
    this.#stems = new THREE.InstancedMesh(stem, flat(data.stem ?? LOOK.stem.colour), n);
    const flowers = data.pads.filter((p) => p[3]).length;
    const dot = new THREE.CircleGeometry(LOOK.flower.radius, 10);
    dot.rotateX(-Math.PI / 2);
    dot.translate(0, 0.004, 0);
    this.#flowers = new THREE.InstancedMesh(
      dot,
      flat(data.flower ?? LOOK.flower.colour),
      Math.max(1, flowers),
    );
    this.#flowers.count = flowers;
    this.#flowerOf = new Int32Array(n).fill(-1);
    let f = 0;
    data.pads.forEach((p, i) => {
      if (p[3]) this.#flowerOf[i] = f++;
    });
    const shadow = flat(LOOK.shadow.colour);
    shadow.depthWrite = false;
    this.#shadows = new THREE.InstancedMesh(hexGeometry(data.s, data.turn ?? 0), shadow, n);
    this.#shadows.renderOrder = -1;
    const flame = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    this.#flames = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      flame,
      n * LOOK.flames.perPad,
    );
    this.#flames.count = 0;
    this.#shade = data.shade.map((c) => new THREE.Color(c));
    for (const m of [this.#pads, this.#stems, this.#flowers, this.#shadows, this.#flames]) {
      m.frustumCulled = false;
      m.matrixAutoUpdate = false;
      scene.add(m);
    }
    data.pads.forEach((p, i) => {
      this.#pads.setColorAt(i, this.#shade[p[2]] as THREE.Color);
      this.#place(i, 0);
    });
    this.#flames.setColorAt(0, this.#c.set('#ffffff'));
    this.#touch();
  }

  /** Every plant back upright and green (a new round). */
  reset(): void {
    this.field.reset();
    this.data.pads.forEach((p, i) => {
      this.#pads.setColorAt(i, this.#shade[p[2]] as THREE.Color);
      this.#place(i, 0);
    });
    this.#drawnMoved.clear();
    this.#burnt = false;
    this.#flames.count = 0;
    this.#touch();
  }

  /** Steps the plants to `now` (ms) with this frame's pushers and fires, and draws them. */
  frame(nowMs: number, pushers: readonly Pusher[], fires: readonly FireSource[]): void {
    const now = nowMs / 1000;
    const dt = Number.isNaN(this.#last) ? 1 / 60 : Math.min(0.05, Math.max(0, now - this.#last));
    this.#last = now;
    if (dt > 0) this.field.step(dt, { now, pushers, fires });
    const moved = this.field.moved();
    for (const i of moved) this.#place(i, now);
    for (const i of this.#drawnMoved) if (!moved.has(i)) this.#place(i, now);
    this.#drawnMoved = new Set(moved);
    // burning: the pad takes the flame's colour, blobs of flame (then smoke) over it, and it is gone with its stem
    let k = 0;
    const n = this.data.pads.length;
    let any = false;
    for (let i = 0; i < n; i += 1) {
      const lit = this.field.burning(i);
      if (lit === undefined) continue;
      any = true;
      const b = burnAt(now - lit);
      this.#place(i, now);
      if (b === undefined) continue;
      if (!b.smoke) this.#pads.setColorAt(i, this.#c.set(b.colour));
      const [x, z] = this.data.pads[i] as (typeof this.data.pads)[number];
      const top = this.field.pose(i).top;
      for (let j = 0; j < LOOK.flames.perPad; j += 1) {
        const ph = (i * 7 + j * 13) % 10;
        const jx = (((ph * 37) % 10) / 10 - 0.5) * this.data.s * 0.9;
        const jz = (((ph * 53) % 10) / 10 - 0.5) * this.data.s * 0.9;
        const flicker = 1 + 0.12 * Math.sin(now * 23 + ph * 1.7);
        const r =
          this.data.s * LOOK.flames.size * b.size * flicker * (j === 0 ? 1 : j === 1 ? 0.75 : 0.55);
        this.#p.set(x + jx, top + 0.15 + b.rise + j * 0.25, z + jz);
        this.#q.setFromAxisAngle(UP, ph);
        this.#m.compose(this.#p, this.#q, this.#sc.set(r, r * 0.8, r));
        this.#flames.setMatrixAt(k, this.#m);
        this.#flames.setColorAt(
          k,
          this.#c.set(
            b.smoke
              ? (LOOK.flames.smoke[j] as string)
              : j === 1
                ? LOOK.flames.second
                : j === 2
                  ? LOOK.flames.third
                  : b.colour,
          ),
        );
        k += 1;
      }
    }
    this.#flames.count = k;
    if (any || this.#burnt) {
      this.#burnt = any;
      this.#touch();
    } else if (moved.size > 0 || this.#drawnMoved.size > 0) this.#touch(false);
  }

  /** Lays pad i (its plate, stem, flower and shadow) as the field has it now. */
  #place(i: number, now: number): void {
    const [x, z] = this.data.pads[i] as (typeof this.data.pads)[number];
    const f = this.#flowerOf[i] as number;
    if (this.field.gone(i, now)) {
      for (const m of [this.#pads, this.#stems, this.#shadows]) m.setMatrixAt(i, this.#hidden);
      if (f >= 0) this.#flowers.setMatrixAt(f, this.#hidden);
      return;
    }
    const { dx, dz, top } = this.field.pose(i);
    const len = Math.hypot(dx, top, dz); // (its own stem: pads stand at their own heights, hexPlants.ts)
    this.#v.set(dx, top, dz).divideScalar(len);
    this.#q.setFromUnitVectors(UP, this.#v);
    this.#p.set(x + dx, top, z + dz);
    this.#m.compose(this.#p, this.#q, this.#sc.set(1, 1, 1));
    this.#pads.setMatrixAt(i, this.#m);
    if (f >= 0) this.#flowers.setMatrixAt(f, this.#m);
    this.#m.compose(this.#v.set(x, 0, z), this.#q, this.#sc.set(1, len, 1));
    this.#stems.setMatrixAt(i, this.#m);
    const [kx, kz] = LOOK.shadow.perHeight;
    this.#p.set(x + dx + kx * top, 0.04, z + dz + kz * top);
    this.#m.compose(this.#p, this.#q.identity(), this.#sc.set(1, 1, 1));
    this.#shadows.setMatrixAt(i, this.#m);
  }

  #touch(colours = true): void {
    for (const m of [this.#pads, this.#stems, this.#flowers, this.#shadows, this.#flames]) {
      m.instanceMatrix.needsUpdate = true;
      if (colours && m.instanceColor !== null) m.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const m of [this.#pads, this.#stems, this.#flowers, this.#shadows, this.#flames]) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
  }
}
