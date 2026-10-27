/**
 * What fire and ice boomerangs (and burning players) leave on the ground, as the HQ videos animate it (60 fps; 2026-10-27:
 * foomerang-fu physics hq.mp4 7:05.9-7:08.6 a fire throw across the pink tree's plaza, 6:51.5-6:59.5 ice trails round it;
 * ff physics hq 2.mp4 6:29-6:51). Pure: one blob `t` seconds after it was laid, sizes as diameters in character widths W,
 * `rise` its height off the ground in W. `seed` (0-1) varies each blob.
 *
 * Fire: small faceted puffs (render/three/groundMarks.ts draws them as low-poly balls) in a lumpy band ~0.6 W wide along the
 * path, several abreast, each ~0.5 W across (the HQ's puffs ~40 px round a 66 px eggplant):
 *   0-0.08 s    a white spark swells into a lemon puff (#fdf325)
 *   0.08-0.9    it burns lemon yellow (#fdf325 -> #fde725), flickering
 *   0.9-1.3     yellow-orange to orange (#fdd725 -> #f99b36)
 *   1.3-2.2     about half turn to grey smoke (#7f7d76) that rises ~0.6 W, swelling a little and fading; the rest shrink away
 *               orange (#f78a2d) by 1.7
 * Ice: a band of cyan (#94edfa) right under the path, ~0.6 W wide, its edge lumpy (patches 0.4-0.8 W):
 *   0-4.0 s     solid
 *   4.0-7.0     each patch pales (#c4f2f5) and shrinks away on its own
 * Dust behind a running player (HQ video, 60 fps: the banana 2:10.85-2:11.70 on sand, the white mug 2:10.3-2:11.35 and the pink
 * donut 10:26.05-10:26.8 on the pavement):
 *   a puff every ~0.17 s at its feet: a solid blob of overlapping circles, one yellow on the whole plaza (#eecb6a: on sand and
 *   pavement, in sun and shadow, whoever runs; the grass islands' dust is green: it is the map's, not the runner's)
 *   0-0.15 s    it swells, 0.4 -> 0.6 W
 *   0.15-0.70   it shrinks away, its area falling steadily, breaking into smaller circles that go one by one
 */
export const GROUND_MOTION = Object.freeze({
  fire: Object.freeze({
    lifeSeconds: 2.2,
    swellSeconds: 0.08,
    sparkSize: 0.12,
    size: 0.5,
    yellowUntil: 0.9,
    orangeUntil: 1.3,
    emberUntil: 1.7,
    smokeShare: 0.5,
    smokeRise: 0.6,
    colours: Object.freeze({
      spark: '#fffbd0',
      fresh: '#fdf325',
      yellow: '#fde725',
      orange: '#fdd725',
      deepOrange: '#f99b36',
      ember: '#f78a2d',
      smoke: '#7f7d76',
    }),
    /** How often a source drops a puff, ms (and at most this far apart, as a fraction of a puff's size). */
    everyMs: 30,
    spacing: 0.22,
  }),
  ice: Object.freeze({
    lifeSeconds: 7.0,
    solidUntil: 4.0,
    size: 0.6,
    colours: Object.freeze({ band: '#94edfa', pale: '#c4f2f5' }),
    everyMs: 16,
    /** The band is solid: patches at most this far apart, as a fraction of their size. */
    spacing: 0.3,
  }),
  dust: Object.freeze({
    everySeconds: 0.17,
    lifeSeconds: 0.7,
    swellSeconds: 0.15,
    startSize: 0.4,
    size: 0.6,
    colour: '#eecb6a',
  }),
});

export type MarkKind = 'fire' | 'ice' | 'dust';

export interface MarkLook {
  readonly colour: string;
  /** Diameter, W. */
  readonly size: number;
  readonly opacity: number;
  /** Height off the ground, W (fire's smoke rises). Absent: on the ground. */
  readonly rise?: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function mix(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const out = [16, 8, 0].map((s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * clamp01(k)));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** One blob of fire `t` seconds after it was laid; undefined once gone. */
export function fireAt(t: number, seed: number): MarkLook | undefined {
  const f = GROUND_MOTION.fire;
  const c = f.colours;
  if (t < 0 || t >= f.lifeSeconds) return undefined;
  const own = 0.85 + 0.3 * seed; // (each puff its own size)
  if (t < f.swellSeconds) {
    const k = t / f.swellSeconds;
    return {
      colour: mix(c.spark, c.fresh, k),
      size: f.sparkSize + (f.size - f.sparkSize) * k,
      opacity: 1,
    };
  }
  if (t === f.swellSeconds) return { colour: c.fresh, size: f.size, opacity: 1 };
  const flicker = 1 + 0.08 * Math.sin(t * 40 + seed * 6.283);
  if (t < f.yellowUntil) {
    const k = (t - f.swellSeconds) / (f.yellowUntil - f.swellSeconds);
    return { colour: mix(c.fresh, c.yellow, k), size: f.size * own * flicker, opacity: 1 };
  }
  if (t < f.orangeUntil) {
    const k = (t - f.yellowUntil) / (f.orangeUntil - f.yellowUntil);
    return { colour: mix(c.orange, c.deepOrange, k), size: f.size * own * flicker, opacity: 1 };
  }
  if (seed < f.smokeShare) {
    // grey smoke rising off it, swelling a little and fading
    const k = (t - f.orangeUntil) / (f.lifeSeconds - f.orangeUntil);
    return {
      colour: c.smoke,
      size: f.size * own * (1 + 0.15 * k),
      opacity: 0.9 * (1 - k * k),
      rise: f.smokeRise * Math.sqrt(k),
    };
  }
  if (t >= f.emberUntil) return undefined;
  const k = (t - f.orangeUntil) / (f.emberUntil - f.orangeUntil);
  return { colour: mix(c.deepOrange, c.ember, k), size: f.size * own * (1 - k), opacity: 1 };
}

/** One patch of ice `t` seconds after it was laid; undefined once gone. Each patch breaks up on its own (`seed`). */
export function iceAt(t: number, seed: number): MarkLook | undefined {
  const i = GROUND_MOTION.ice;
  if (t < 0 || t >= i.lifeSeconds) return undefined;
  const own = i.size * (0.65 + 0.7 * ((seed * 7.31) % 1)); // (a lumpy edge: patches 0.4-0.8 W)
  if (t < i.solidUntil) return { colour: i.colours.band, size: own, opacity: 1 };
  // the break-up: a patch starts going anywhere in the first half of it, then shrinks and pales to nothing
  const span = i.lifeSeconds - i.solidUntil;
  const start = i.solidUntil + seed * span * 0.5;
  const k = clamp01((t - start) / (i.lifeSeconds - start));
  if (k >= 1) return undefined;
  return {
    colour: mix(i.colours.band, i.colours.pale, Math.min(1, k * 2 + 0.3)),
    size: own * (1 - k * 0.7),
    opacity: 1 - k,
  };
}

/** One circle of a puff of dust `t` seconds after it rose; undefined once gone. A circle's `seed` (0–1) is when it goes: the
 * last fifth of the puff's life, seed 1 (its main circle) at the very end. */
export function dustAt(t: number, seed: number): MarkLook | undefined {
  const d = GROUND_MOTION.dust;
  const end = d.lifeSeconds * (0.8 + 0.2 * seed);
  if (t < 0 || t >= end) return undefined;
  const size =
    t < d.swellSeconds
      ? d.startSize + ((d.size - d.startSize) * t) / d.swellSeconds
      : d.size * Math.sqrt(1 - (t - d.swellSeconds) / (end - d.swellSeconds));
  return { colour: d.colour, size, opacity: 1 };
}

export const markAt = (kind: MarkKind, t: number, seed: number): MarkLook | undefined =>
  kind === 'fire' ? fireAt(t, seed) : kind === 'ice' ? iceAt(t, seed) : dustAt(t, seed);
