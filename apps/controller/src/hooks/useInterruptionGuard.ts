import { useEffect, useEffectEvent } from 'react';

/**
 * Belt and braces for "never stuck": whenever the page is hidden, unloaded or loses focus, tell
 * the session to go neutral NOW (sent immediately, because a hidden page's timers may be
 * throttled). The joystick also releases itself; neutral is idempotent, so both paths are safe.
 */
export function useInterruptionGuard(neutralize: () => void): void {
  const interrupted = useEffectEvent(neutralize);
  useEffect(() => {
    const onHidden = (): void => {
      if (document.visibilityState === 'hidden') interrupted();
    };
    window.addEventListener('blur', interrupted);
    window.addEventListener('pagehide', interrupted);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('blur', interrupted);
      window.removeEventListener('pagehide', interrupted);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, []);
}
