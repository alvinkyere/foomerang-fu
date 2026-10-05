/**
 * Haptics are an ENHANCEMENT, never part of correctness: where the platform has them we use them,
 * where it does not (iPhone Safari has no Vibration API) the controller is exactly as usable.
 */
export function tick(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function')
      navigator.vibrate(8);
  } catch {
    // blocked or unsupported: carry on
  }
}
