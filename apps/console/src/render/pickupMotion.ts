import { PICKUP_LABEL_SECONDS } from './powerBadge';

/**
 * Taking a power Book, as the reference video animates it (4:03.98 the mug touches the Multi Book, read every frame at 4×;
 * art/physics_reference/README.md, "Taking a power"). Pure: what shows `t` seconds after the take. Lengths are in character
 * widths W (the mug ≈ 15 px at 640 wide; ours: render/drawnSize.ts).
 *
 *   0.03 s        the badge starts to fade in over the player; a white flash at the Book with thin streaks in the power's
 *                 colour radiating from it
 *   0.10 s        the badge is fully up (it does not grow or move: only its opacity changes)
 *   0.07–0.17 s   the streaks have become small capsules of confetti flying out to 1.0–1.6 W; the Book shrinks away
 *   0.17–0.45 s   the confetti lies on the ground, shrinking and fading
 *   1.97–2.07 s   the badge fades out (full at 4:05.98, gone by 4:06.07)
 */

export const PICKUP_MOTION = Object.freeze({
  /** The whole badge, from the take to gone. */
  badgeSeconds: PICKUP_LABEL_SECONDS,
  fadeInFrom: 0.03,
  fadeInTo: 0.1,
  fadeOutSeconds: 0.1,
  /** The flash and the streaks. */
  flashFrom: 0.03,
  flashTo: 0.08,
  flashRadius: 0.35,
  streaks: 14,
  streakFrom: 0.3,
  streakTo: 1.1,
  /** The confetti. */
  confetti: 14,
  flyTo: 0.17,
  goneAt: 0.45,
  nearest: 1.0,
  farthest: 1.6,
  pieceLength: 0.2,
  pieceWidth: 0.08,
  /** The Book shrinking away. */
  bookGoneAt: 0.15,
});

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** The badge's opacity `t` seconds after the take (0 before it starts and after it is gone). */
export function badgeOpacity(t: number): number {
  const m = PICKUP_MOTION;
  if (t < m.fadeInFrom || t >= m.badgeSeconds) return 0;
  const inn = clamp01((t - m.fadeInFrom) / (m.fadeInTo - m.fadeInFrom));
  const out = clamp01((m.badgeSeconds - t) / m.fadeOutSeconds);
  return Math.min(inn, out);
}

/** The white flash and its streaks: visible or not, and how far out the streaks reach (W). */
export function flashAt(t: number): { readonly on: boolean; readonly streakOut: number } {
  const m = PICKUP_MOTION;
  const on = t >= m.flashFrom && t < m.flashTo;
  const k = clamp01((t - m.flashFrom) / (m.flashTo - m.flashFrom));
  return { on, streakOut: m.streakFrom + (m.streakTo - m.streakFrom) * k };
}

/** A deterministic spread of the confetti: piece `i`'s angle and final distance (W). */
export function confettiPiece(i: number): { readonly angle: number; readonly distance: number } {
  const m = PICKUP_MOTION;
  const golden = 2.399963229728653; // the golden angle: an even, non-repeating spread
  const angle = i * golden;
  const f = (((i * 0.6180339887) % 1) + 1) % 1;
  return { angle, distance: m.nearest + (m.farthest - m.nearest) * f };
}

/** Piece `i` at `t`: how far out (W), its scale (1 full) and opacity; undefined when not shown. */
export function confettiAt(
  i: number,
  t: number,
): { readonly distance: number; readonly scale: number; readonly opacity: number } | undefined {
  const m = PICKUP_MOTION;
  if (t < m.flashTo - 0.01 || t >= m.goneAt) return undefined;
  const { distance } = confettiPiece(i);
  const fly = clamp01((t - (m.flashTo - 0.01)) / (m.flyTo - (m.flashTo - 0.01)));
  const eased = 1 - (1 - fly) * (1 - fly); // fast out, settling as it lands
  const lie = clamp01((t - m.flyTo) / (m.goneAt - m.flyTo));
  return {
    distance: m.streakTo * 0.5 + (distance - m.streakTo * 0.5) * eased,
    scale: 1 - lie,
    opacity: 1 - lie * lie,
  };
}

/** The Book's scale `t` seconds after it was taken (it shrinks away). */
export const bookScale = (t: number): number => clamp01(1 - t / PICKUP_MOTION.bookGoneAt);
