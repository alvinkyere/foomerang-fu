/**
 * What fire and ice boomerangs (and burning players) leave on the ground, as the reference video animates it (read every frame
 * at 2–4×; art/physics_reference/README.md, "Fire boomerang", "Ice boomerang"). Pure: one blob `t` seconds after it was laid,
 * sizes as diameters in character widths W. `seed` (0–1) varies each blob.
 *
 * Fire (10:00.16–10:03.0):
 *   0–0.10 s    a small white-yellow spark swells into a round yellow puff (0.08 → 0.3 W); the puffs overlap in a band
 *               ≈ 0.5 W wide (10:00.6–10:01.8)
 *   0.10–0.90   it burns yellow (#faf723 → #fce11f), flickering ±10%
 *   0.90–1.30   orange (#f3a935 → #eb9f34)
 *   1.30–1.70   red (#d95934), shrinking away; about a third of the puffs turn to dark smoke balls (#533c25) instead
 * Ice (6:02.45–6:05.6; 6:53–6:57):
 *   0–3.0 s     a solid bright-cyan band (#5fd6f4) right under the boomerang's path, ≈ 0.3 W wide
 *   3.0–4.3     it breaks up: each patch shrinks and fades on its own, pale (#a9e9f6), until gone (±0.5 s: the video's camera moves)
 * Dust behind a running player (HQ video, 60 fps: the banana 2:10.85–2:11.70 on sand, the white mug 2:10.3–2:11.35 and the pink
 * donut 10:26.05–10:26.8 on the pavement):
 *   a puff every ≈ 0.17 s at its feet: a solid blob of overlapping circles, one yellow on the whole plaza (#eecb6a: on sand and
 *   pavement, in sun and shadow, whoever runs; the grass islands' dust is green: it is the map's, not the runner's)
 *   0–0.15 s    it swells, 0.4 → 0.6 W
 *   0.15–0.70   it shrinks away, its area falling steadily, breaking into smaller circles that go one by one
 */
export const GROUND_MOTION = Object.freeze({
  fire: Object.freeze({
    lifeSeconds: 1.7,
    swellSeconds: 0.1,
    sparkSize: 0.08,
    size: 0.3,
    yellowUntil: 0.9,
    orangeUntil: 1.3,
    smokeShare: 0.33,
    colours: Object.freeze({
      spark: '#fffbd0',
      fresh: '#faf723',
      yellow: '#fce11f',
      orange: '#f3a935',
      deepOrange: '#eb9f34',
      red: '#d95934',
      smoke: '#533c25',
    }),
    /** How often a source drops a puff, ms (and at most this far apart, as a fraction of a puff's size). */
    everyMs: 30,
    spacing: 0.25,
  }),
  ice: Object.freeze({
    lifeSeconds: 4.3,
    solidUntil: 3.0,
    size: 0.3,
    colours: Object.freeze({ band: '#5fd6f4', pale: '#a9e9f6' }),
    everyMs: 16,
    /** The band is solid: patches at most this far apart, as a fraction of their size. */
    spacing: 0.35,
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
  if (t < f.swellSeconds) {
    const k = t / f.swellSeconds;
    return {
      colour: mix(c.spark, c.fresh, k),
      size: f.sparkSize + (f.size - f.sparkSize) * k,
      opacity: 1,
    };
  }
  const flicker = 1 + 0.1 * Math.sin(t * 40 + seed * 6.283);
  if (t < f.yellowUntil) {
    const k = (t - f.swellSeconds) / (f.yellowUntil - f.swellSeconds);
    return { colour: mix(c.fresh, c.yellow, k), size: f.size * flicker, opacity: 1 };
  }
  if (t < f.orangeUntil) {
    const k = (t - f.yellowUntil) / (f.orangeUntil - f.yellowUntil);
    return { colour: mix(c.orange, c.deepOrange, k), size: f.size * flicker, opacity: 1 };
  }
  const k = (t - f.orangeUntil) / (f.lifeSeconds - f.orangeUntil);
  const smoke = seed < f.smokeShare;
  return {
    colour: smoke ? c.smoke : mix(c.deepOrange, c.red, k * 2),
    size: f.size * (1 - k) * (smoke ? 0.8 : 1),
    opacity: smoke ? 0.85 * (1 - k) : 1 - k * k,
  };
}

/** One patch of ice `t` seconds after it was laid; undefined once gone. Each patch breaks up on its own (`seed`). */
export function iceAt(t: number, seed: number): MarkLook | undefined {
  const i = GROUND_MOTION.ice;
  if (t < 0 || t >= i.lifeSeconds) return undefined;
  if (t < i.solidUntil) return { colour: i.colours.band, size: i.size, opacity: 1 };
  // the break-up: a patch starts going anywhere in the first half of it, then shrinks and pales to nothing
  const span = i.lifeSeconds - i.solidUntil;
  const start = i.solidUntil + seed * span * 0.5;
  const k = clamp01((t - start) / (i.lifeSeconds - start));
  if (k >= 1) return undefined;
  return {
    colour: mix(i.colours.band, i.colours.pale, Math.min(1, k * 2 + 0.3)),
    size: i.size * (1 - k * 0.7),
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
