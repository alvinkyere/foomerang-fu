/**
 * The hex meadow's plants (ff physics hq 2.mp4 20:02; art/hex_meadow/README.md, "The plants"): flat hexagonal pads on thin stems
 * that players and boomerangs push aside and that spring back, and that fire burns pad by pad. Pure: no three.js. Lengths are the
 * scene's ground units (a pad's middle at (x, z), its stem `height` tall); times in seconds.
 *
 *   at rest    each pad at its own height and lean (the frame's pads, matched to their edges one by one: heights sd ~0.2 about the
 *              stems' 2.9, leans sd ~0.1): they overlap irregularly, as the HQ's do
 *   pushed     a player or a flying boomerang shoves the pads its body reaches until their tops are clear of it (1205.50: a
 *              boomerang's path opens a lane, stems tilted 40-60 degrees; 1204.75 a player stands in a gap of its own)
 *   spring     they stay bent about a second and are upright again within ~3 s (1205.5-1206.75: the lane still open at 1206.5)
 *   fire       fire (a fire boomerang, a burning player, a blast) lights the pads it touches; a burning pad lights each touching
 *              pad 0.25-0.5 s later (1207.0 -> 1207.6: the burning band one pad wider each side in ~0.5 s); it blazes yellow, golden,
 *              orange, turns to dark smoke ~1 s in and is gone, the smoke gone by ~1.8 s (1207.0 lit, smoke 1208.4, bare 1209.2)
 *
 * Presentation only: the rules know nothing of the plants (they hide no one and stop nothing, as the HQ shows).
 */

/** A pad: its middle, its shade, whether it has a flower, and (where a map's model sets each plate's own) its height. */
export type PadRow =
  | readonly [x: number, z: number, shade: number, flower: boolean]
  | readonly [x: number, z: number, shade: number, flower: boolean, height: number];

/**
 * One field of plants. The meadow's is one field; the gong islands' and the plaza's (owner, 2026-11-06: the same plants, the same
 * physics on every map they grow on) are a field per plant, each as its model built it (art/hex_meadow/plants_from_glb.py).
 */
export interface PlantsData {
  /** A pad's circumradius (a hexagon, flat-topped unless turned). */
  readonly s: number;
  /** The stems' height: the pads' tops at rest (a pad's own height, where given, instead). */
  readonly height: number;
  readonly pads: readonly PadRow[];
  /** The pads' colours, darkest (lowest) to lightest (highest). */
  readonly shade: readonly string[];
  /** The hexagons' turn about the upright: a corner's angle from the scene's +x toward its +z (radians; the meadow's 0). */
  readonly turn?: number;
  /** The flowers' (buds') colour, the stems', and how dark a pad's rim is against its middle; absent: the meadow's. */
  readonly flower?: string;
  readonly stem?: string;
  readonly rim?: number;
  /** The pads' shadow on the ground: its colour and where it falls per unit of a pad's height (scene x, z); absent: the meadow's. */
  readonly shadow?: { readonly colour: string; readonly perHeight: readonly [number, number] };
}

export interface Pusher {
  readonly x: number;
  readonly z: number;
  /** How far from its middle it shoves pad tops (its body and a pad's half width). */
  readonly radius: number;
}

export interface FireSource {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export interface Pose {
  /** The pad's top, moved from rest along the ground (its stem's lean). */
  readonly dx: number;
  readonly dz: number;
  /** The top's height. */
  readonly top: number;
}

/** The burn's timing (seconds from a pad catching): `spread` the delay before it lights each touching pad (random in the range). */
export const BURN = { spread: [0.25, 0.5] as const, gone: 1.0, end: 1.8 };

/** The plants' spring: stiffness and damping per second squared / per second (bent ~1 s, upright within ~3 s), and how far a stem leans. */
const SPRING = { k: 5, c: 4.2, maxLean: (65 * Math.PI) / 180, follow: 30 };

const HEX = /^#[0-9a-f]{6}$/i;

/** The manifest's `plants`: one field or a list of them; none at all if any is malformed (the map's own data: checked, not trusted). */
export function parsePlantGroups(raw: unknown): PlantsData[] {
  const list = Array.isArray(raw) ? (raw as unknown[]) : [raw];
  const groups = list.map(parsePlants);
  return groups.every((g): g is PlantsData => g !== undefined) ? groups : [];
}

/** One field of the manifest's `plants`, or undefined when it is absent or malformed. */
export function parsePlants(raw: unknown): PlantsData | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!finite(r['s']) || r['s'] <= 0 || !finite(r['height']) || r['height'] <= 0) return undefined;
  const shade = r['shade'];
  const pads = r['pads'];
  if (!Array.isArray(shade) || !shade.every((c) => typeof c === 'string' && HEX.test(c)))
    return undefined;
  if (!Array.isArray(pads)) return undefined;
  for (const p of pads as unknown[]) {
    if (!Array.isArray(p) || (p.length !== 4 && p.length !== 5)) return undefined;
    const [x, z, k, f, h] = p as unknown[];
    if (!finite(x) || !finite(z) || !finite(k) || typeof f !== 'boolean') return undefined;
    if (!Number.isInteger(k) || k < 0 || k >= shade.length) return undefined;
    if (p.length === 5 && (!finite(h) || h <= 0)) return undefined;
  }
  const colour = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);
  for (const k of ['flower', 'stem']) if (r[k] !== undefined && !colour(r[k])) return undefined;
  for (const k of ['turn', 'rim']) if (r[k] !== undefined && !finite(r[k])) return undefined;
  let shadow: PlantsData['shadow'];
  if (r['shadow'] !== undefined) {
    const sh = r['shadow'] as Record<string, unknown> | null;
    const ph = sh?.['perHeight'];
    if (
      sh === null ||
      typeof sh !== 'object' ||
      !colour(sh['colour']) ||
      !Array.isArray(ph) ||
      ph.length !== 2 ||
      !ph.every(finite)
    )
      return undefined;
    shadow = { colour: sh['colour'], perHeight: [ph[0] as number, ph[1] as number] };
  }
  return {
    s: r['s'],
    height: r['height'],
    pads: pads as PadRow[],
    shade: shade as string[],
    ...(finite(r['turn']) ? { turn: r['turn'] } : {}),
    ...(colour(r['flower']) ? { flower: r['flower'] } : {}),
    ...(colour(r['stem']) ? { stem: r['stem'] } : {}),
    ...(finite(r['rim']) ? { rim: r['rim'] } : {}),
    ...(shadow !== undefined ? { shadow } : {}),
  };
}

/** A pad's burn `t` seconds after it caught: its flame's colour, or smoke once it is gone; undefined before and after. */
export function burnAt(
  t: number,
): { colour: string; smoke: boolean; size: number; rise: number } | undefined {
  if (t < 0 || t >= BURN.end) return undefined;
  if (t < BURN.gone) {
    // (the HQ's burning pads, k-means at 1208.6: #f7e91f yellow, #f2db50, #f3b625 golden, #ef9a3a / #ca7937 orange)
    const colour = t < 0.25 ? '#f7e91f' : t < 0.5 ? '#f2db50' : t < 0.75 ? '#f3b625' : '#ef9a3a';
    return { colour, smoke: false, size: Math.min(1, 0.6 + t * 4), rise: t * 0.4 };
  }
  // (its smoke: dark brown-grey puffs, #5e5450, about a pad across (the HQ at 1207.2-1208.8), rising, shrinking a little)
  const u = (t - BURN.gone) / (BURN.end - BURN.gone);
  return { colour: '#5e5450', smoke: true, size: 1.1 - 0.45 * u, rise: 0.4 + u * 1.2 };
}

/** A small seeded hash in [0, 1): the same field burns the same way every time. */
const hash = (a: number, b: number): number => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

export class PlantField {
  readonly data: PlantsData;
  /** Each pad's stem length and rest lean (its top's place at rest, off its foot). */
  readonly #len: Float64Array;
  #tallest = 0;
  readonly #rx: Float64Array;
  readonly #rz: Float64Array;
  readonly #dx: Float64Array;
  readonly #dz: Float64Array;
  readonly #vx: Float64Array;
  readonly #vz: Float64Array;
  /** When each pad caught fire (NaN: not burning). */
  readonly #lit: Float64Array;
  readonly #neighbours: number[][];
  /** Pads into which fire has yet to pass: [pad, when]. */
  #pending: [number, number][] = [];
  /** Pads that have moved (only those are stepped). */
  readonly #moving = new Set<number>();
  /** A coarse grid of the pads by place, for finding the ones near a point. */
  readonly #grid = new Map<string, number[]>();
  readonly #cell: number;

  constructor(data: PlantsData) {
    this.data = data;
    const n = data.pads.length;
    this.#dx = new Float64Array(n);
    this.#dz = new Float64Array(n);
    this.#vx = new Float64Array(n);
    this.#vz = new Float64Array(n);
    this.#lit = new Float64Array(n).fill(Number.NaN);
    this.#len = new Float64Array(n);
    this.#rx = new Float64Array(n);
    this.#rz = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      // (a sum of two uniforms: a soft bell, sd ~0.12 / ~0.04, never past 0.3 / 0.1 a side: the measured spread, held a little in so a field shows no ground between its pads)
      const own = (data.pads[i] as PadRow)[4];
      this.#len[i] =
        own !== undefined
          ? own + 0.04 * (hash(i, 1) - 0.5)
          : data.height + 0.3 * (hash(i, 1) + hash(i, 2) - 1);
      this.#rx[i] = 0.1 * (hash(i, 3) + hash(i, 4) - 1);
      this.#rz[i] = 0.1 * (hash(i, 5) + hash(i, 6) - 1);
    }
    this.#tallest = Math.max(data.height, ...this.#len);
    this.#dx.set(this.#rx);
    this.#dz.set(this.#rz);
    this.#cell = 2 * data.s;
    data.pads.forEach(([x, z], i) => {
      const key = this.#key(x, z);
      const list = this.#grid.get(key);
      if (list === undefined) this.#grid.set(key, [i]);
      else list.push(i);
    });
    // touching: the lattice's next cells (their middles sqrt(3) s apart), with a little slack
    const reach = Math.sqrt(3) * data.s * 1.15;
    this.#neighbours = data.pads.map(([x, z], i) => this.#near(x, z, reach).filter((j) => j !== i));
  }

  #key(x: number, z: number): string {
    return `${Math.floor(x / this.#cell)},${Math.floor(z / this.#cell)}`;
  }

  #near(x: number, z: number, r: number): number[] {
    const out: number[] = [];
    const k = Math.ceil(r / this.#cell);
    const cx = Math.floor(x / this.#cell);
    const cz = Math.floor(z / this.#cell);
    for (let i = cx - k; i <= cx + k; i += 1)
      for (let j = cz - k; j <= cz + k; j += 1)
        for (const p of this.#grid.get(`${i},${j}`) ?? []) {
          const [px, pz] = this.data.pads[p] as PadRow;
          if (Math.hypot(px - x, pz - z) <= r) out.push(p);
        }
    return out;
  }

  /** Every pad upright and green again (a new round). */
  reset(): void {
    this.#dx.set(this.#rx);
    this.#dz.set(this.#rz);
    this.#vx.fill(0);
    this.#vz.fill(0);
    this.#lit.fill(Number.NaN);
    this.#pending = [];
    this.#moving.clear();
  }

  /** Sets pad `i` alight at `now` (no change if it already burns) and queues the fire's passing to the pads it touches. */
  ignite(i: number, now: number): void {
    if (!Number.isNaN(this.#lit[i] as number)) return;
    this.#lit[i] = now;
    for (const j of this.#neighbours[i] as number[]) {
      const [lo, hi] = BURN.spread;
      this.#pending.push([j, now + lo + (hi - lo) * hash(i, j)]);
    }
  }

  /** When pad `i` caught fire, or undefined. */
  burning(i: number): number | undefined {
    const t = this.#lit[i] as number;
    return Number.isNaN(t) ? undefined : t;
  }

  /** Pad `i` has burnt away by `now`. */
  gone(i: number, now: number): boolean {
    const t = this.#lit[i] as number;
    return !Number.isNaN(t) && now - t >= BURN.gone;
  }

  /** Pad `i`'s lean now. */
  pose(i: number): Pose {
    const dx = this.#dx[i] as number;
    const dz = this.#dz[i] as number;
    const h = this.#len[i] as number;
    return { dx, dz, top: Math.sqrt(Math.max(0, h * h - dx * dx - dz * dz)) };
  }

  /** Pads that have moved since the last reset (the drawing need only update these). */
  moved(): ReadonlySet<number> {
    return this.#moving;
  }

  step(
    dt: number,
    input: { now: number; pushers: readonly Pusher[]; fires: readonly FireSource[] },
  ): void {
    const { now } = input;
    // fire: what it touches now, and what passes on from burning pads
    for (const f of input.fires)
      for (const i of this.#near(f.x, f.z, f.radius + (this.data.s * Math.sqrt(3)) / 2))
        this.ignite(i, now);
    if (this.#pending.length > 0) {
      const due = this.#pending.filter(([, t]) => t <= now);
      if (due.length > 0) {
        this.#pending = this.#pending.filter(([, t]) => t > now);
        for (const [j] of due) this.ignite(j, now);
      }
    }
    // pushed: each pad top a pusher's body reaches moves out until it is clear (eased: `follow` per second)
    const maxLean = (this.#tallest + 0.35) * Math.sin(SPRING.maxLean);
    const ease = 1 - Math.exp(-SPRING.follow * dt);
    for (const p of input.pushers)
      for (const i of this.#near(p.x, p.z, p.radius + maxLean)) {
        const [x, z] = this.data.pads[i] as PadRow;
        const tx = x + (this.#dx[i] as number) - p.x;
        const tz = z + (this.#dz[i] as number) - p.z;
        const d = Math.hypot(tx, tz);
        if (d >= p.radius) continue;
        const nx = d > 1e-6 ? tx / d : 1;
        const nz = d > 1e-6 ? tz / d : 0;
        const by = (p.radius - d) * ease;
        this.#dx[i] = (this.#dx[i] as number) + nx * by;
        this.#dz[i] = (this.#dz[i] as number) + nz * by;
        // (moving with the push: once let go it carries on a little and swings back)
        this.#vx[i] = (this.#vx[i] as number) * 0.5 + (nx * by) / dt;
        this.#vz[i] = (this.#vz[i] as number) * 0.5 + (nz * by) / dt;
        this.#moving.add(i);
      }
    // the spring
    for (const i of this.#moving) {
      let vx = this.#vx[i] as number;
      let vz = this.#vz[i] as number;
      let dx = this.#dx[i] as number;
      let dz = this.#dz[i] as number;
      const rx = this.#rx[i] as number;
      const rz = this.#rz[i] as number;
      vx += (-SPRING.k * (dx - rx) - SPRING.c * vx) * dt;
      vz += (-SPRING.k * (dz - rz) - SPRING.c * vz) * dt;
      dx += vx * dt;
      dz += vz * dt;
      const lean = Math.hypot(dx, dz);
      const most = (this.#len[i] as number) * Math.sin(SPRING.maxLean);
      if (lean > most) {
        dx *= most / lean;
        dz *= most / lean;
        vx = 0;
        vz = 0;
      }
      if (Math.hypot(dx - rx, dz - rz) < 1e-4 && Math.hypot(vx, vz) < 1e-3) {
        dx = rx;
        dz = rz;
        vx = 0;
        vz = 0;
        this.#moving.delete(i);
      }
      this.#dx[i] = dx;
      this.#dz[i] = dz;
      this.#vx[i] = vx;
      this.#vz[i] = vz;
    }
  }
}
