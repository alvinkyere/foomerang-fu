/**
 * The aura while a boomerang is being called home, as the reference video shows it (the tutorial's PULL BACK, 0:17.9–0:18.7;
 * art/physics_reference/README.md): a pale cyan-white ring round the boomerang that flashes (lit 17.90–18.13, dark 18.20–18.27,
 * lit 18.33–18.60), from the moment the hold starts until it arrives. The owner: the same aura is on the caller's hands (too
 * small to see at the video's 640 × 360). Pure timing; three/ThreePlaza.ts draws it.
 */
export const CALL_AURA = Object.freeze({
  /** Read by eye: the ring is pale cyan-white. */
  colour: '#e2f6ff',
  /** Its diameter, in boomerang lengths. */
  ringOfBoomerang: 1.5,
  onSeconds: 0.3,
  offSeconds: 0.15,
});

/** How lit the aura is `t` seconds after the call began: 1 while lit (fading in over its first 0.05 s), 0 while dark. */
export function auraPulse(t: number): number {
  const period = CALL_AURA.onSeconds + CALL_AURA.offSeconds;
  const k = ((t % period) + period) % period;
  if (k >= CALL_AURA.onSeconds) return 0;
  return Math.min(1, k / 0.05);
}
