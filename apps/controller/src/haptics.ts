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

/** Whether this phone can vibrate at all (iPhone Safari cannot). */
export const canVibrate = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/**
 * Vibrate for a rumble the TV asked for: a stronger rumble buzzes more of its duration (the rest is pauses), so strength is
 * felt even on phones whose motor has one speed. Returns false where the phone cannot vibrate (the caller shows a pulse).
 */
export function rumble(intensity: number, durationMs: number): boolean {
  if (!canVibrate()) return false;
  try {
    const buzz = Math.max(15, Math.round(durationMs * (0.25 + 0.75 * intensity)));
    if (buzz >= durationMs) navigator.vibrate(durationMs);
    else {
      const half = Math.round(buzz / 2);
      const gap = Math.round((durationMs - buzz) / 2);
      navigator.vibrate([half, gap, buzz - half]);
    }
    return true;
  } catch {
    return false;
  }
}
