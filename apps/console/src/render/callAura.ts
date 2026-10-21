/**
 * The aura while a boomerang is being called home, as the reference video shows it (the tutorial's PULL BACK, 0:17.80–18.90,
 * read frame by frame; art/physics_reference/README.md, "The calling aura, frame by frame"): a thin pale cyan-white ring round
 * the boomerang for as long as THROW is held for it. It does not flash (an earlier reading took the gap at 18.17–18.30, where the
 * hold was let go, for a flash): it fades in over two frames from a little larger (17.90, 18.33), stays lit (18.40 onwards, past
 * half a second without a break), and is gone the frame the hold ends. When the boomerang lifts (18.67) the ring it lay in stays
 * where it was and comes apart in a quarter of a second, while the boomerang carries its own home. The owner: the same aura is
 * on the caller's hands (too small to see at the video's 640 × 360). Pure timing; three/ThreePlaza.ts draws it.
 */
export const CALL_AURA = Object.freeze({
  /** Read by eye: the ring is pale cyan-white. */
  colour: '#e2f6ff',
  /** Its diameter, in boomerang lengths (19 px against the boomerang's 13 px). */
  ringOfBoomerang: 1.5,
  /** Fading in: two frames of the video, starting this much larger. */
  inSeconds: 2 / 30,
  inScale: 1.12,
  /** The ring left behind when the boomerang lifts: gone after this long (18.67 → ≈ 18.92), spreading as it fades. */
  leftSeconds: 0.25,
  leftScale: 1.3,
});

export interface AuraLook {
  readonly opacity: number;
  readonly scale: number;
}

/** The aura `t` seconds after the call began: fading in from a little larger, then lit and still for as long as it lasts. */
export function auraIn(t: number): AuraLook {
  const k = Math.min(1, Math.max(0, t) / CALL_AURA.inSeconds);
  if (k >= 1) return { opacity: 1, scale: 1 };
  return { opacity: 0.25 + 0.75 * k, scale: CALL_AURA.inScale + (1 - CALL_AURA.inScale) * k };
}

/** The ring the boomerang lay in, `t` seconds after it lifted out of it: spreading and fading away. */
export function auraLeftBehind(t: number): AuraLook {
  const k = Math.min(1, Math.max(0, t) / CALL_AURA.leftSeconds);
  return { opacity: 1 - k, scale: 1 + (CALL_AURA.leftScale - 1) * k };
}
