import { useEffect, useState } from 'react';
import { rumble } from '../haptics';
import type { SessionPort } from '../session';

/**
 * The TV's rumbles, felt: the phone vibrates where it can; where it cannot (iPhone), a red glow pulses over the controls at
 * the rumble's strength and fades. Never in the way: it passes every touch through to the controls.
 */
export function RumblePulse({ session }: { readonly session: SessionPort }) {
  const [pulse, setPulse] = useState<{ strength: number; key: number } | undefined>(undefined);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let key = 0;
    const stop = session.onRumble(({ intensity, durationMs }) => {
      if (rumble(intensity, durationMs)) return;
      key += 1;
      setPulse({ strength: intensity, key });
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => setPulse(undefined), durationMs + 200);
    });
    return () => {
      stop();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [session]);
  if (pulse === undefined) return null;
  return (
    <div
      key={pulse.key}
      className="rumble-pulse"
      data-testid="rumble-pulse"
      data-strength={pulse.strength}
      aria-hidden="true"
      style={{ opacity: 0.25 + 0.6 * pulse.strength }}
    />
  );
}
