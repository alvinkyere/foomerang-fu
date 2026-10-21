/**
 * A burning player and a death by fire, as the reference video animates them (read every frame at 2.6×; art/physics_reference/
 * README.md, "Fire boomerang"). Pure. Lengths in character widths W; heights in body heights H.
 *
 * Burning (9:55.9–9:57.6): the body keeps its own colours; a column of fire balls climbs it — about six at a time, each born at
 * the feet, rising to ≈ 1.1 H while it shrinks (0.38 → 0.18 W) and turns from yellow (#fbe01e) to orange (#f08a2c), every
 * ≈ 0.3 s; the column leans back the way they run. (Fire is left on the ground behind them: groundMarkMotion.ts.)
 *
 * Dying of it (9:57.62–9:58.3):
 *   0–0.15 s    the body falls onto its side and lies there, whole (it is not cut in two)
 *   0–0.15 s    the last flames on it go orange to red and out
 *   0–0.55 s    four dark smoke balls (#4a3a33) rise off it ≈ 0.9 H, swelling a little and fading; a grey wisp is the last
 */
export const FIRE_MOTION = Object.freeze({
  balls: 6,
  riseSeconds: 0.3,
  riseTo: 1.1,
  sizeFrom: 0.38,
  sizeTo: 0.18,
  low: '#fbe01e',
  high: '#f08a2c',
  /** How far the column leans back against the run, W per (W/s) of speed, at most 0.4 W. */
  lean: 0.04,
  death: Object.freeze({
    fallSeconds: 0.15,
    flamesOutSeconds: 0.15,
    smokeBalls: 4,
    smokeSeconds: 0.55,
    smokeRise: 0.9,
    smoke: '#4a3a33',
    lastFlame: '#d95934',
  }),
});

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function mix(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const out = [16, 8, 0].map((s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * clamp01(k)));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Fire ball `i` on a burning body `t` seconds after it caught: height (H), sideways offset (W), size (W) and colour. */
export function flameBall(
  i: number,
  t: number,
): {
  readonly height: number;
  readonly side: number;
  readonly size: number;
  readonly colour: string;
} {
  const m = FIRE_MOTION;
  const phase = (t / m.riseSeconds + i / m.balls) % 1; // each ball climbs in turn
  return {
    height: phase * m.riseTo,
    side: 0.18 * Math.sin(i * 2.4 + t * 9),
    size: m.sizeFrom + (m.sizeTo - m.sizeFrom) * phase,
    colour: mix(m.low, m.high, phase),
  };
}

/** The burnt body's tilt (radians, onto its side) `t` seconds after it died. */
export const burntTilt = (t: number): number =>
  (Math.PI / 2) * clamp01(t / FIRE_MOTION.death.fallSeconds);

/** The last flames on the burnt body: colour and size (fraction); undefined once out. */
export function lastFlames(
  t: number,
): { readonly colour: string; readonly size: number } | undefined {
  const d = FIRE_MOTION.death;
  if (t >= d.flamesOutSeconds) return undefined;
  const k = t / d.flamesOutSeconds;
  return { colour: mix(FIRE_MOTION.high, d.lastFlame, k), size: 1 - k };
}

/** Smoke ball `i` off the burnt body `t` seconds after it died: height (H), size (W) and opacity; undefined once gone. */
export function smokeBall(
  i: number,
  t: number,
):
  | {
      readonly height: number;
      readonly side: number;
      readonly size: number;
      readonly opacity: number;
    }
  | undefined {
  const d = FIRE_MOTION.death;
  const start = (i / d.smokeBalls) * 0.15;
  const k = (t - start) / (d.smokeSeconds - start);
  if (k < 0 || k >= 1) return undefined;
  return {
    height: 0.3 + d.smokeRise * k,
    side: 0.15 * Math.sin(i * 1.9),
    size: 0.22 + 0.12 * k,
    opacity: 0.85 * (1 - k),
  };
}
