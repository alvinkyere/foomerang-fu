import type { ControllerPhase } from '@foomerang/controller-sdk';

/**
 * Consumer-facing connection state: connected or not, in plain words. No milliseconds, no
 * jargon — those are diagnostics. It is the screen's single live status region for assistive tech.
 */
export function ConnectionBadge({ phase }: { readonly phase: ControllerPhase }) {
  const reconnecting = phase === 'RECONNECTING';
  return (
    <p
      className="connection-badge"
      role="status"
      data-state={reconnecting ? 'reconnecting' : 'connected'}
    >
      <span className="connection-dot" aria-hidden="true" />
      {reconnecting ? 'Reconnecting…' : 'Connected'}
    </p>
  );
}
