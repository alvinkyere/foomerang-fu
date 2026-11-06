/**
 * The Explosive's blast as the HQ video draws it (foomerang-fu physics hq.mp4 5:22.47, every frame at 60 fps, the camera's pan and shake
 * taken out: art/physics_reference/blast_hq.py, README "The Explosive's blast, measured on the HQ"). Pure: what shows `t` seconds after
 * the blast. Lengths are fractions of R, the ring's final radius (the kill radius); ground axes x and z, height y.
 *
 *   0–0.15 s     a solid faceted white ball, 0.27 R at once, shrinking away
 *   0.10–0.45    a see-through yellow dome filling the ring
 *   0.10–0.78    the ring on the ground: filled to ~0.43 s, then a band thinning 0.17 R -> 0.08 R; yellow, orange, pinkest at 0.57 s,
 *                fading from 0.70 s
 *   0.20–1.05    fire balls in clusters (a ring of them ~0.7 R out and one in the middle): orange, red, dark red by 0.47 s, then
 *                purple-grey smoke shrinking to specks
 *   0.30–0.65    pale see-through puffs inside the ring
 *   0–0.5        the screen shakes, at random each frame, up to 2% of its height
 */

export const EXPLOSION_SECONDS = 1.05;

type Key = readonly [t: number, value: number];
type ColourKey = readonly [t: number, colour: string];

export interface ExplosionPose {
  readonly white?: { readonly radius: number } | undefined;
  readonly dome?: { readonly radius: number; readonly opacity: number } | undefined;
  readonly ring?:
    | {
        readonly outer: number;
        readonly inner: number;
        readonly colour: string;
        readonly opacity: number;
      }
    | undefined;
  readonly balls: readonly {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly size: number;
    readonly colour: string;
  }[];
  readonly puffs: readonly {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly size: number;
    readonly opacity: number;
  }[];
}

/** The white ball's radius (measured 73–76 px of 270 at once, then shrinking). */
const WHITE: readonly Key[] = [
  [0, 0.05],
  [0.017, 0.27],
  [0.067, 0.28],
  [0.083, 0.245],
  [0.1, 0.24],
  [0.117, 0.13],
  [0.133, 0.06],
  [0.15, 0],
];
/** The ring's outer edge (measured every frame). */
const OUTER: readonly Key[] = [
  [0.1, 0.27],
  [0.133, 0.35],
  [0.15, 0.43],
  [0.167, 0.54],
  [0.2, 0.65],
  [0.233, 0.73],
  [0.267, 0.78],
  [0.3, 0.81],
  [0.333, 0.84],
  [0.367, 0.88],
  [0.4, 0.9],
  [0.433, 0.91],
  [0.467, 0.93],
  [0.5, 0.94],
  [0.533, 0.96],
  [0.567, 0.97],
  [0.6, 0.97],
  [0.633, 0.98],
  [0.667, 0.99],
  [0.7, 0.99],
  [0.733, 1],
  [0.78, 1],
];
/** Its inner edge once the middle has burnt out (filled before 0.44 s). */
const INNER: readonly Key[] = [
  [0.44, 0],
  [0.45, 0.56],
  [0.467, 0.63],
  [0.483, 0.77],
  [0.5, 0.78],
  [0.533, 0.82],
  [0.567, 0.84],
  [0.633, 0.85],
  [0.667, 0.87],
  [0.717, 0.89],
  [0.75, 0.92],
  [0.78, 0.94],
];
const RING_COLOUR: readonly ColourKey[] = [
  [0.1, '#fbfd73'],
  [0.2, '#fdf759'],
  [0.3, '#fbfd1f'],
  [0.367, '#fcfd1c'],
  [0.4, '#fcf529'],
  [0.433, '#fddf36'],
  [0.467, '#fdc443'],
  [0.5, '#fca94d'],
  [0.533, '#fd915d'],
  [0.567, '#fd7b69'],
  [0.6, '#fd7f6f'],
  [0.667, '#fea07d'],
  [0.7, '#feb581'],
  [0.78, '#fdd283'],
];
/** A fire ball's colour as it cools (measured on the balls), then the smoke it becomes. */
const BALL_COLOUR: readonly ColourKey[] = [
  [0.2, '#f5b40a'],
  [0.217, '#e05805'],
  [0.233, '#e44908'],
  [0.283, '#da2e0b'],
  [0.3, '#d43311'],
  [0.35, '#be3422'],
  [0.383, '#b73c30'],
  [0.433, '#a9423c'],
  [0.467, '#9f4443'],
  [0.5, '#83626e'],
  [0.533, '#826776'],
  [0.65, '#746573'],
  [0.85, '#626268'],
  [1.05, '#7a7c7f'],
];

const lerp = (keys: readonly Key[], t: number): number => {
  const first = keys[0] as Key;
  const last = keys[keys.length - 1] as Key;
  if (t <= first[0]) return first[1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < keys.length; i += 1) {
    const [t1, v1] = keys[i] as Key;
    if (t <= t1) {
      const [t0, v0] = keys[i - 1] as Key;
      return v0 + (v1 - v0) * ((t - t0) / (t1 - t0));
    }
  }
  return last[1];
};

const rgb = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const hex = (c: readonly number[]): string =>
  '#' +
  c
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

const colourAt = (keys: readonly ColourKey[], t: number): string => {
  const first = keys[0] as ColourKey;
  const last = keys[keys.length - 1] as ColourKey;
  if (t <= first[0]) return first[1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < keys.length; i += 1) {
    const [t1, c1] = keys[i] as ColourKey;
    if (t <= t1) {
      const [t0, c0] = keys[i - 1] as ColourKey;
      const u = (t - t0) / (t1 - t0);
      const a = rgb(c0);
      const b = rgb(c1);
      return hex(a.map((v, k) => v + ((b[k] ?? 0) - v) * u));
    }
  }
  return last[1];
};

/** A small seeded random (mulberry32): the same blast every time for a seed. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

interface Ball {
  readonly angle: number;
  readonly out: number;
  readonly height: number;
  readonly size: number;
  readonly delay: number;
  readonly drift: number;
}

/** The blast's fire balls: six clusters round ~0.7 R and one in the middle, 3–5 faceted balls each, 0.08–0.13 R. */
function ballsFor(seed: number): Ball[] {
  const r = random(seed * 9973 + 17);
  const balls: Ball[] = [];
  const turn = r() * Math.PI * 2;
  for (let c = 0; c < 7; c += 1) {
    const middle = c === 6;
    const angle = middle ? 0 : turn + (c / 6) * Math.PI * 2 + (r() - 0.5) * 0.5;
    const out = middle ? 0.05 : 0.62 + r() * 0.14;
    const n = 3 + Math.floor(r() * 3);
    for (let k = 0; k < n; k += 1) {
      balls.push({
        angle: angle + (r() - 0.5) * (middle ? Math.PI * 2 : 0.45),
        out: out + (r() - 0.5) * (middle ? 0.2 : 0.12),
        height: middle ? 0.18 + r() * 0.25 : 0.04 + r() * 0.12,
        size: 0.055 + r() * 0.04, // (a ball's radius: the HQ's are 0.10-0.13 R across)
        delay: r() * 0.03,
        drift: 0.08 + r() * 0.12,
      });
    }
  }
  return balls;
}

const smooth = (a: number, b: number, x: number): number => {
  const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

/** What shows `t` seconds after the blast (seed: which of the blast's random layouts). */
export function explosionAt(t: number, seed = 1): ExplosionPose {
  const white = t >= 0 && t < 0.15 ? { radius: lerp(WHITE, t) } : undefined;
  const ringOn = t >= 0.1 && t < 0.78;
  const outer = lerp(OUTER, t);
  const ring = ringOn
    ? {
        outer,
        inner: t < 0.44 ? 0 : lerp(INNER, t),
        colour: colourAt(RING_COLOUR, t),
        opacity: 1 - smooth(0.7, 0.78, t),
      }
    : undefined;
  const dome =
    t >= 0.1 && t < 0.45
      ? { radius: outer * 0.95, opacity: 0.4 * (1 - smooth(0.25, 0.45, t)) }
      : undefined;
  const balls: ExplosionPose['balls'][number][] = [];
  if (t >= 0.2 && t < EXPLOSION_SECONDS) {
    for (const b of ballsFor(seed)) {
      const tb = t - b.delay;
      if (tb < 0.2) continue;
      // out fast to their place by 0.25 s, then drifting on and rising as they cool and turn to smoke
      const reach =
        b.out * (0.55 + 0.45 * smooth(0.2, 0.26, tb)) +
        b.drift * smooth(0.3, EXPLOSION_SECONDS, tb);
      const grow = smooth(0.2, 0.25, tb);
      const shrink = 1 - smooth(0.62, EXPLOSION_SECONDS, tb) * 0.88;
      const size = b.size * grow * shrink;
      if (size <= 0.002) continue;
      balls.push({
        x: Math.cos(b.angle) * reach,
        z: Math.sin(b.angle) * reach,
        y: b.height + 0.15 * smooth(0.3, EXPLOSION_SECONDS, tb),
        size,
        colour: colourAt(BALL_COLOUR, tb),
      });
    }
  }
  const puffs: ExplosionPose['puffs'][number][] = [];
  if (t >= 0.3 && t < 0.65) {
    const r = random(seed * 31 + 5);
    for (let k = 0; k < 6; k += 1) {
      const a = r() * Math.PI * 2;
      const d = 0.2 + r() * 0.4;
      puffs.push({
        x: Math.cos(a) * d,
        z: Math.sin(a) * d,
        y: 0.1,
        size: 0.12 + r() * 0.08,
        opacity: 0.35 * smooth(0.3, 0.36, t) * (1 - smooth(0.5, 0.65, t)),
      });
    }
  }
  return { white, dome, ring, balls, puffs };
}

/**
 * The screen's shake `t` seconds after a blast, as a fraction of the screen's height (measured: random each frame, not a wobble; up to
 * ±2% vertically to 0.2 s, about half that by 0.35 s, still by 0.5 s; sideways about a third of it).
 */
export function shakeAt(t: number): { x: number; y: number } {
  if (t <= 0 || t >= 0.5) return { x: 0, y: 0 };
  const amp =
    t < 0.2 ? 0.02 : t < 0.35 ? 0.02 - (0.011 * (t - 0.2)) / 0.15 : 0.009 * (1 - (t - 0.35) / 0.15);
  const r = random(Math.floor(t * 60) * 2654435761);
  return { x: amp * 0.33 * (r() * 2 - 1), y: amp * (r() * 2 - 1) };
}
