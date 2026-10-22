/**
 * A player who walks off an island and falls (the sky islands; the HQ videos: the eggplant 5:03.87 in the first, the sushi
 * 7:59.50 in the second, camera motion taken out). It turns to face the camera, arms out and waving; rises 0.64 of its width
 * on screen in 0.30 s, easing to a stop; then drops away under gravity (2.54 widths on screen in the next 0.3 s) out of
 * sight below the island, gone ≈ 0.65 s after it went over. The camera looks down at 56.17°, so a height shows at cos 56.17°
 * of a width: in the world it rises 1.15 widths and falls at ≈ 101 widths/s². Pure: heights in body widths, up positive.
 */
const SEEN = Math.cos((56.17 * Math.PI) / 180);

export const FALL = Object.freeze({
  /** How high it rises, body widths (world). */
  rise: 0.64 / SEEN,
  peakAt: 0.3,
  /** Its fall from the peak, body widths a second² (world). */
  gravity: (2 * 2.54) / (0.3 * 0.3) / SEEN,
  /** Gone from sight (below the island's edge). */
  goneAt: 0.65,
  /** Its arms wave up and down this many times a second. */
  wave: 3,
});

export interface FallPose {
  /** Height above where it went over, body widths (negative: below the ground). */
  readonly lift: number;
  /** Its arms: -1 … 1, down … up. */
  readonly arms: number;
  readonly visible: boolean;
}

export function fallPose(t: number): FallPose {
  const { rise, peakAt, gravity, goneAt, wave } = FALL;
  const u = Math.min(1, t / peakAt);
  const lift =
    t <= peakAt ? rise * (1 - (1 - u) * (1 - u)) : rise - 0.5 * gravity * (t - peakAt) ** 2;
  return { lift, arms: Math.sin(2 * Math.PI * wave * t), visible: t < goneAt };
}
