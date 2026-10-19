/**
 * An Explosive boomerang's blast, as the reference video draws it (10:17.4, sampled every frame along a ray from its centre;
 * art/physics_reference/README.md, "Explosive boomerang"). Pure: what shows `t` seconds after the puff. Lengths are fractions of
 * the blast radius R, the full ring, which is what kills (owner, 2026-10-19). Ground axes x and z.
 *
 *   0–0.10 s   a white puff
 *   0.10–0.20  a yellow flash filling out to 0.63 R
 *   0.20–0.74  the ring: fast to 0.84 R by 0.3 s, then slowly to R by 0.6 s; yellow until ~0.43 s, then orange, then red-pink
 *              while its band thins from the inside; gone by 0.74 s
 *   0.30–0.74  dark smoke balls near the middle (read by eye)
 */

export const BLAST_SECONDS = 0.74;

type Key = readonly [t: number, value: number];

/** The ring's outer edge (fraction of R), sampled. */
const OUTER: readonly Key[] = [
  [0.1, 0.17],
  [0.13, 0.3],
  [0.17, 0.53],
  [0.2, 0.63],
  [0.23, 0.74],
  [0.27, 0.8],
  [0.3, 0.84],
  [0.33, 0.85],
  [0.37, 0.88],
  [0.4, 0.9],
  [0.43, 0.94],
  [0.47, 0.94],
  [0.5, 0.96],
  [0.53, 0.96],
  [0.57, 0.98],
  [0.6, 1],
  [0.74, 1],
];

/** The band's inside edge once the middle has burnt out (from 0.5 s; before that it is a thick band, by eye 0.1 R). */
const INNER: readonly Key[] = [
  [0.5, 0.79],
  [0.57, 0.84],
  [0.6, 0.88],
  [0.63, 0.9],
  [0.67, 0.95],
  [0.7, 0.97],
  [0.74, 1],
];

/** The ring's colour at the edge, sampled (each held until the next). */
const COLOUR: readonly (readonly [number, string])[] = [
  [0.1, '#fdfd8c'],
  [0.43, '#ffe981'],
  [0.47, '#f2c168'],
  [0.5, '#ebc78f'],
  [0.53, '#f79b76'],
  [0.57, '#f2847e'],
  [0.6, '#f3857f'],
  [0.63, '#eb7a74'],
  [0.67, '#e4968a'],
  [0.7, '#f8ac9f'],
];

function lerp(keys: readonly Key[], t: number): number {
  const first = keys[0] as Key;
  if (t <= first[0]) return first[1];
  for (let i = 1; i < keys.length; i += 1) {
    const [t1, v1] = keys[i] as Key;
    if (t <= t1) {
      const [t0, v0] = keys[i - 1] as Key;
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return (keys[keys.length - 1] as Key)[1];
}

function colourAt(t: number): string {
  let c = (COLOUR[0] as readonly [number, string])[1];
  for (const [at, colour] of COLOUR) if (t >= at) c = colour;
  return c;
}

/** The smoke balls (read by eye: two or three dark red-brown lumps just off the middle, turning grey as they go). */
const SMOKE = [
  { x: -0.08, z: -0.18, size: 0.12 },
  { x: 0.1, z: -0.12, size: 0.1 },
  { x: 0.02, z: 0.2, size: 0.11 },
] as const;

export interface BlastPose {
  readonly puff?: { readonly radius: number };
  readonly flash?: { readonly radius: number; readonly colour: string };
  readonly ring?: {
    readonly outer: number;
    readonly inner: number;
    readonly colour: string;
    readonly opacity: number;
  };
  readonly smoke: readonly {
    readonly x: number;
    readonly z: number;
    readonly size: number;
    readonly colour: string;
  }[];
}

export function blastAt(t: number): BlastPose {
  if (t < 0 || t >= BLAST_SECONDS) return { smoke: [] };
  const smoke =
    t < 0.3
      ? []
      : SMOKE.map((s) => ({
          x: s.x,
          z: s.z - (t - 0.3) * 0.1, // drifting a little up the screen
          size: s.size,
          colour: t < 0.5 ? '#7a2a2e' : '#5e4a5c',
        }));
  if (t < 0.1) return { puff: { radius: 0.3 }, smoke };
  if (t < 0.2) return { flash: { radius: lerp(OUTER, t), colour: '#fdfd8c' }, smoke };
  const outer = lerp(OUTER, t);
  const inner = t < 0.5 ? Math.max(0, outer - 0.1) : Math.min(outer, lerp(INNER, t));
  return {
    ring: {
      outer,
      inner,
      colour: colourAt(t),
      opacity: t < 0.6 ? 1 : 1 - (t - 0.6) / (BLAST_SECONDS - 0.6),
    },
    smoke,
  };
}
