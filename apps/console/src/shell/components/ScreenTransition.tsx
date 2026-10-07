import type { ReactNode } from 'react';

export type TransitionDirection = 'forward' | 'back' | 'fade';

/**
 * Enter animation for a screen: a short slide + crossfade. Keyed by `screenKey`, so each new
 * screen replays it. The outgoing screen is already gone and the incoming one is focusable at
 * once — the animation is decoration, never a gate.
 */
export function ScreenTransition({
  screenKey,
  direction = 'forward',
  children,
}: {
  readonly screenKey: string;
  readonly direction?: TransitionDirection;
  readonly children: ReactNode;
}) {
  return (
    <div key={screenKey} className={`screen-enter screen-enter--${direction}`}>
      {children}
    </div>
  );
}
