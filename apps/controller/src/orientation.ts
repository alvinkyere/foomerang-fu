import type { ControllerOrientation } from '@foomerang/protocol';
import { useEffect, useState } from 'react';

export type Viewport = 'portrait' | 'landscape';

/**
 * The game states a PREFERENCE (in its manifest); it is never a requirement. Return which way the
 * player could rotate to match it, or nothing if they already match or the game does not mind.
 */
export function orientationHint(
  preferred: ControllerOrientation,
  current: Viewport,
): 'LANDSCAPE' | 'PORTRAIT' | undefined {
  if (preferred === 'any' || preferred === current) return undefined;
  return preferred === 'landscape' ? 'LANDSCAPE' : 'PORTRAIT';
}

const QUERY = '(orientation: portrait)';

/** The viewport’s orientation, kept live as the phone rotates. Never assumes width > height. */
export function useViewportOrientation(): Viewport {
  const read = (): Viewport =>
    typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches
      ? 'portrait'
      : 'landscape';
  const [orientation, setOrientation] = useState<Viewport>(read);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(QUERY);
    const update = (): void =>
      setOrientation(window.matchMedia(QUERY).matches ? 'portrait' : 'landscape');
    media.addEventListener('change', update);
    update();
    return () => media.removeEventListener('change', update);
  }, []);

  return orientation;
}
