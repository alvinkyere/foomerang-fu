import type { DebrisPiece } from './propDebris';

/**
 * How a killed character comes apart (presentation of a rules fact; the reference video at 0:07, 1:03 and 2:21). Soft characters
 * split into two halves along the line of the hit; the mug shatters (its shards are prop debris) and leaves a coffee puddle. All
 * of it is plain mechanics, pure and seeded so a replay looks the same. Lengths are in units of the character's height, times in
 * seconds; the renderer scales and places it. Axes: x and z on the ground (z is the world's +y, towards the viewer), y up.
 */

const GRAVITY = 20;
/** Sliding on the ground, a half slows at this constant deceleration (kinetic friction). */
const FRICTION = 6;

export interface Half {
  readonly velocity: { readonly x: number; readonly y: number; readonly z: number };
  /** Tumble, radians per second (the two halves turn opposite ways). */
  readonly spin: number;
  /** Its centre starts this high. */
  readonly height: number;
}

export interface HalfPose {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  /** Its turn about the view axis: ±π/2 once it lies on its side. */
  readonly tilt: number;
  readonly resting: boolean;
}

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

/**
 * The two halves of a character cut by a hit going `hit` (on the ground; undefined: no direction, they split across the view).
 * Momentum is conserved: together they carry on along the hit (each the same push), and they separate across it with equal and
 * opposite speeds. Both pop up alike; they tumble opposite ways. [left, right] of the hit's direction.
 */
export function halvesFor(
  hit: { readonly x: number; readonly z: number } | undefined,
  seed: string,
): [Half, Half] {
  const random = randomFrom(seed);
  const between = (lo: number, hi: number) => lo + (hi - lo) * random();
  const len = hit === undefined ? 0 : Math.hypot(hit.x, hit.z);
  const n = hit === undefined || len === 0 ? { x: 0, z: 1 } : { x: hit.x / len, z: hit.z / len };
  const across = { x: -n.z, z: n.x };
  const push = hit === undefined ? 0 : between(0.8, 1.2);
  const apart = between(1.2, 1.8);
  const up = between(3.5, 4.5);
  const spin = between(7, 10);
  const half = (side: -1 | 1): Half => ({
    velocity: {
      x: n.x * push + across.x * apart * side,
      y: up,
      z: n.z * push + across.z * apart * side,
    },
    spin: spin * side,
    height: 0.3,
  });
  return [half(-1), half(1)];
}

/** Where a half is `t` seconds after the death: flying under gravity, then sliding to a stop on its side. */
export function halfAt(h: Half, t: number): HalfPose {
  const { velocity: v } = h;
  // it lands when height + vy·t − g·t²/2 = 0
  const land = (v.y + Math.sqrt(v.y * v.y + 2 * GRAVITY * h.height)) / GRAVITY;
  if (t < land)
    return {
      position: { x: v.x * t, y: h.height + v.y * t - (GRAVITY * t * t) / 2, z: v.z * t },
      tilt: h.spin * t,
      resting: false,
    };
  // on the ground, on its side, sliding under friction: it stops after v/μ having slid v²/2μ (exact)
  const speed = Math.hypot(v.x, v.z);
  const stopAfter = speed / FRICTION;
  const s = Math.min(t - land, stopAfter);
  const slid = speed === 0 ? 0 : (speed * s - (FRICTION * s * s) / 2) / speed;
  return {
    position: { x: v.x * (land + slid), y: 0, z: v.z * (land + slid) },
    tilt: (Math.sign(h.spin) || 1) * (Math.PI / 2),
    resting: t - land >= stopAfter,
  };
}

/** The coffee a broken mug spills: a puddle of this final radius, spreading with this time constant. */
export const PUDDLE = Object.freeze({ radius: 0.9, tau: 0.6 });

/** The puddle's radius `t` seconds after the mug broke: a viscous spread, r = R(1 − e^(−t/τ)). */
export const puddleRadius = (t: number): number =>
  t <= 0 ? 0 : PUDDLE.radius * (1 - Math.exp(-t / PUDDLE.tau));

/** The burst of droplets that comes with a soft character's halves (in the character's colour): small and fast. */
export function dropletsFor(
  hit: { readonly x: number; readonly z: number } | undefined,
  seed: string,
): DebrisPiece[] {
  const random = randomFrom(`${seed}:drops`);
  const between = (lo: number, hi: number) => lo + (hi - lo) * random();
  const heading = hit === undefined ? undefined : Math.atan2(hit.z, hit.x);
  return Array.from({ length: 12 }, (_, n) => {
    const angle =
      heading !== undefined && n % 3 !== 2
        ? heading + between(-Math.PI / 2, Math.PI / 2)
        : (n / 12) * Math.PI * 2 + between(-0.3, 0.3);
    const speed = between(1.5, 3.5);
    const size = between(0.05, 0.1);
    return {
      offset: { x: between(-0.1, 0.1), y: between(0.3, 0.6), z: between(-0.1, 0.1) },
      velocity: { x: Math.cos(angle) * speed, y: between(2, 4.5), z: Math.sin(angle) * speed },
      spin: { x: 0, y: 0, z: 0 },
      size: { x: size, y: size, z: size },
      shade: between(0.85, 1.1),
    };
  });
}
