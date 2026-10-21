import { ICE_LOOK } from './iceLook';

/**
 * Freezing and thawing, as the reference video animates them (read every frame at 4×; art/physics_reference/README.md, "Ice
 * boomerang"). Pure. `t` is seconds since the hit (freeze) or since the ice broke (thaw). Lengths in character widths W.
 *
 * Freeze (6:54.53 the hit):
 *   0–0.03 s     the body goes dark blue (#5a6fe0) — the cold hits first
 *   0.03–0.15 s  the block grows round it from the body's own size to full (1.75 W), the body brightening to ice-blue
 *   0.15 s on    the block stands; the body stays ice-blue (#70c6f6)
 * Thaw (6:56.38 the ice breaks):
 *   0–0.10 s     the body's blue lifts (through #6c8bf9) back to its own colours
 *   0–0.17 s     a white frost puff where the block stood, ≈ 0.7 → 1.1 W across, fading
 *   0–0.84 s     pale chunks of ice lie flat in the block's footprint; full until 0.44 s, gone by 0.84 s
 */
export const ICE_MOTION = Object.freeze({
  coldBody: '#5a6fe0',
  coldSeconds: 0.03,
  blockFrom: 0.03,
  blockFull: 0.15,
  /** The block's starting size, as a fraction of full (it starts round the body). */
  blockStart: 0.55,
  thawBody: '#6c8bf9',
  thawSeconds: 0.1,
  puffSeconds: 0.17,
  puffFrom: 0.7,
  puffTo: 1.1,
  chunks: 8,
  chunksHoldSeconds: 0.44,
  chunksGoneSeconds: 0.84,
});

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function mix(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const out = [16, 8, 0].map((s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * k));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** The frozen body's tint `t` seconds after the hit. */
export function freezeBody(t: number): string {
  const m = ICE_MOTION;
  if (t < m.coldSeconds) return m.coldBody;
  return mix(
    m.coldBody,
    ICE_LOOK.body,
    clamp01((t - m.coldSeconds) / (m.blockFull - m.coldSeconds)),
  );
}

/** The block's size `t` seconds after the hit, as a fraction of full; 0 before it starts. */
export function blockScale(t: number): number {
  const m = ICE_MOTION;
  if (t < m.blockFrom) return 0;
  const k = clamp01((t - m.blockFrom) / (m.blockFull - m.blockFrom));
  return m.blockStart + (1 - m.blockStart) * k;
}

/** The body's tint `t` seconds after the ice broke; undefined once it is its own colours again. */
export function thawBody(
  t: number,
): { readonly colour: string; readonly amount: number } | undefined {
  const m = ICE_MOTION;
  if (t >= m.thawSeconds) return undefined;
  return { colour: m.thawBody, amount: 1 - t / m.thawSeconds };
}

/** The frost puff `t` seconds after the ice broke: its diameter (W) and opacity; undefined once gone. */
export function puffAt(t: number): { readonly size: number; readonly opacity: number } | undefined {
  const m = ICE_MOTION;
  if (t < 0 || t >= m.puffSeconds) return undefined;
  const k = t / m.puffSeconds;
  return { size: m.puffFrom + (m.puffTo - m.puffFrom) * k, opacity: 0.85 * (1 - k) };
}

/** The ice chunks' opacity `t` seconds after the ice broke (0: gone). */
export function chunksOpacity(t: number): number {
  const m = ICE_MOTION;
  if (t < 0 || t >= m.chunksGoneSeconds) return 0;
  if (t <= m.chunksHoldSeconds) return 1;
  return 1 - (t - m.chunksHoldSeconds) / (m.chunksGoneSeconds - m.chunksHoldSeconds);
}

/** Where chunk `i` lies in the block's footprint, as offsets in W (deterministic). */
export function chunkSpot(i: number): {
  readonly x: number;
  readonly z: number;
  readonly size: number;
} {
  const a = i * 2.399963229728653;
  const r = 0.25 + 0.45 * (((i * 0.6180339887) % 1) + 0);
  return {
    x: Math.cos(a) * r * 0.9,
    z: Math.sin(a) * r * 0.6,
    size: 0.28 + 0.14 * ((i * 0.37) % 1),
  };
}
