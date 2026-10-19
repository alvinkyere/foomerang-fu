/**
 * How a killed character comes apart, as the reference video shows it (measured: art/physics_reference/README.md, "Deaths").
 * Presentation of a rules fact; pure and seeded so a replay looks the same. Ground axes x and z (z is the world's +y, towards
 * the viewer), y up.
 *
 * A soft character (the donut at 1:03): it is cut in two and both halves SLIDE away along the ground (no flight), slowing at a
 * constant deceleration, turning as they go — the far half (along the hit) about 2.6 of the character's widths in about 2.3 s,
 * the near half staying about where it died (≲0.2 widths) — with a burst of bits in its colour (up to ~14, out to ~1.4
 * widths, gone by ~1.6 s). Lengths for a soft death are in the character's widths (W).
 *
 * The mug (2:21, in the registered plaza footage, so in world units): coffee splashes where it stood; droplets drift slowly
 * outward and the puddle, after about 1.2 s, spreads to its full size by about 1.9 s and stays; a few ceramic shards lie close
 * by. Lengths for the mug are in world units.
 */

/** A small deterministic generator (mulberry32) seeded from a string (FNV-1a). */
function randomFrom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- a soft character's halves -------------------------------------------------------------------------------------------

/** The far half (carried along the hit) slides this far, in this long (the donut at 1:03). */
export const FAR_HALF = Object.freeze({ distance: 2.6, seconds: 2.3 });
/** The near half (the dough, at 1:03) barely moves: it stays about where it died, under the same friction. */
export const NEAR_HALF_DISTANCE = 0.2;
/** One constant deceleration for both: the far half's (d = v₀T/2, v₀ = μT ⇒ μ = 2d/T²), widths per second². */
export const HALF_FRICTION = (2 * FAR_HALF.distance) / (FAR_HALF.seconds * FAR_HALF.seconds);

export interface Half {
  /** The way it slides, on the ground (unit). */
  readonly direction: { readonly x: number; readonly z: number };
  /** How far it slides before it stops (widths). */
  readonly distance: number;
  /** How far it turns over its whole slide (radians; the two turn opposite ways). */
  readonly turn: number;
}

export interface HalfPose {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  /** Its turn about the view axis so far. */
  readonly tilt: number;
  readonly resting: boolean;
}

/** The two halves of a character cut by a hit going `hit` (undefined: no direction, they part across the view). [far, near]. */
export function halvesFor(
  hit: { readonly x: number; readonly z: number } | undefined,
  seed: string,
): [Half, Half] {
  const random = randomFrom(seed);
  const len = hit === undefined ? 0 : Math.hypot(hit.x, hit.z);
  const n = hit === undefined || len === 0 ? { x: 1, z: 0 } : { x: hit.x / len, z: hit.z / len };
  // a little play in the angle each way, as the video's halves do not leave exactly along the line
  const wobble = (random() - 0.5) * 0.6;
  const along = {
    x: n.x * Math.cos(wobble) - n.z * Math.sin(wobble),
    z: n.x * Math.sin(wobble) + n.z * Math.cos(wobble),
  };
  const turn = (Math.PI / 2) * (0.8 + 0.4 * random()); // about a quarter turn over the slide (read by eye)
  return [
    { direction: along, distance: FAR_HALF.distance, turn },
    { direction: { x: -along.x, z: -along.z }, distance: NEAR_HALF_DISTANCE, turn: -turn },
  ];
}

/** Where a half is `t` seconds after the death: sliding to a stop at constant deceleration (exact), turning as it slides. */
export function halfAt(h: Half, t: number): HalfPose {
  const v0 = Math.sqrt(2 * HALF_FRICTION * h.distance);
  const stopAfter = v0 / HALF_FRICTION;
  const s = Math.min(Math.max(0, t), stopAfter);
  const slid = v0 * s - (HALF_FRICTION * s * s) / 2;
  const k = h.distance === 0 ? 1 : slid / h.distance;
  return {
    position: { x: h.direction.x * slid, y: 0, z: h.direction.z * slid },
    tilt: h.turn * k,
    resting: t >= stopAfter,
  };
}

/** The bits that burst with the halves (in the character's colour): out to about 1.4 widths quickly, gone by ~1.6 s. */
export const BITS = Object.freeze({ count: 12, reach: 1.4, outSeconds: 0.3, goneBy: 1.6 });

export interface Bit {
  readonly angle: number;
  /** How far out it ends (widths). */
  readonly reach: number;
  readonly size: number;
}

export function bitsFor(seed: string): Bit[] {
  const random = randomFrom(`${seed}:bits`);
  return Array.from({ length: BITS.count }, (_, i) => ({
    angle: (i / BITS.count) * Math.PI * 2 + (random() - 0.5) * 0.5,
    reach: BITS.reach * (0.4 + 0.6 * random()),
    size: 0.08 + 0.06 * random(),
  }));
}

/** A bit at `t`: out along its angle (easing to its reach over `outSeconds`), fading out by `goneBy`. */
export function bitAt(b: Bit, t: number): { x: number; z: number; opacity: number } {
  const k = Math.min(1, Math.max(0, t) / BITS.outSeconds);
  const r = b.reach * (1 - (1 - k) * (1 - k));
  const opacity =
    t >= BITS.goneBy ? 0 : 1 - Math.max(0, t - BITS.outSeconds) / (BITS.goneBy - BITS.outSeconds);
  return { x: Math.cos(b.angle) * r, z: Math.sin(b.angle) * r, opacity };
}

// --- the mug -------------------------------------------------------------------------------------------------------------

/**
 * The coffee's radius (world units; the equivalent circle of the puddle) after the mug broke, read from the video every 0.1 s:
 * a splash of about 22 u at once, then from ~1.2 s the puddle spreads almost linearly to 50 u by ~1.9 s and stays.
 */
const PUDDLE_CURVE: ReadonlyArray<readonly [number, number]> = [
  [0, 9],
  [0.2, 21],
  [0.5, 26],
  [1.2, 25],
  [1.4, 33.6],
  [1.5, 38.2],
  [1.6, 42.5],
  [1.7, 46.5],
  [1.8, 48.8],
  [1.9, 49.7],
  [2.0, 50],
];
/** Its final size and shape: an equivalent radius of 50 u, about 121 × 104 u across (wider than deep). */
export const PUDDLE = Object.freeze({ radius: 50, aspect: 121 / 104 });

export function puddleRadius(t: number): number {
  if (t <= 0) return 0;
  for (let i = 1; i < PUDDLE_CURVE.length; i += 1) {
    const [t1, r1] = PUDDLE_CURVE[i] as readonly [number, number];
    if (t <= t1) {
      const [t0, r0] = PUDDLE_CURVE[i - 1] as readonly [number, number];
      return r0 + ((r1 - r0) * (t - t0)) / (t1 - t0);
    }
  }
  return PUDDLE.radius;
}

/** The coffee droplets: ~12, starting ~35 u out and drifting outward at up to ~70 u/s; the spreading puddle takes them by ~1.6 s. */
export const DROPS = Object.freeze({ count: 12, start: 35, maxSpeed: 70, goneBy: 1.6 });

export interface Drop {
  readonly angle: number;
  readonly speed: number;
  readonly size: number;
}

export function dropsFor(seed: string): Drop[] {
  const random = randomFrom(`${seed}:drops`);
  return Array.from({ length: DROPS.count }, (_, i) => ({
    angle: (i / DROPS.count) * Math.PI * 2 + (random() - 0.5) * 0.6,
    speed: DROPS.maxSpeed * random(),
    size: 4 + 4 * random(),
  }));
}

/** A droplet at `t` (world units): drifting out; gone once the puddle reaches it, or by `goneBy`. */
export function dropAt(d: Drop, t: number): { x: number; z: number; visible: boolean } {
  const r = DROPS.start + d.speed * Math.min(Math.max(0, t), DROPS.goneBy);
  return {
    x: Math.cos(d.angle) * r,
    z: Math.sin(d.angle) * r,
    visible: t < DROPS.goneBy && r > puddleRadius(t),
  };
}

/** The ceramic: a few shards (3–5 seen) that come to rest 40–60 u out within ~0.3 s (read by eye: faint on the paving). */
export const SHARDS = Object.freeze({ count: 4, near: 40, far: 60, settleSeconds: 0.3 });

export interface Shard {
  readonly angle: number;
  readonly rest: number;
  readonly size: number;
  readonly turn: number;
}

export function shardsFor(seed: string): Shard[] {
  const random = randomFrom(`${seed}:shards`);
  return Array.from({ length: SHARDS.count }, (_, i) => ({
    angle: (i / SHARDS.count) * Math.PI * 2 + (random() - 0.5) * 1.2,
    rest: SHARDS.near + (SHARDS.far - SHARDS.near) * random(),
    size: 8 + 5 * random(),
    turn: (random() - 0.5) * Math.PI,
  }));
}

/** A shard at `t` (world units): sliding out to rest at constant deceleration over `settleSeconds`. */
export function shardAt(s: Shard, t: number): { x: number; z: number; turn: number } {
  const k = Math.min(1, Math.max(0, t) / SHARDS.settleSeconds);
  const r = s.rest * (2 * k - k * k);
  return { x: Math.cos(s.angle) * r, z: Math.sin(s.angle) * r, turn: s.turn * k };
}

// --- who comes apart how -------------------------------------------------------------------------------------------------

export type Liquid = 'coffee' | 'milk';

/**
 * How a character dies: the mug shatters (2:21); everyone else is cut in two (1:03). The liquid ones spill: the mug its
 * coffee, and the milk carton its milk (owner, 2026-10-19: "it is also liquid") — the same spill, splash, droplets and puddle.
 */
export function deathOf(kind: string | undefined): {
  shatters: boolean;
  spills: Liquid | undefined;
} {
  if (kind === 'coffee') return { shatters: true, spills: 'coffee' };
  if (kind === 'milk') return { shatters: false, spills: 'milk' };
  return { shatters: false, spills: undefined };
}
