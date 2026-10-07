import type { ControllerState } from '@foomerang/controller-sdk';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { ControlRenderer } from '../components/ControlRenderer';
import { useInterruptionGuard } from '../hooks/useInterruptionGuard';
import { CONTEXT_BADGE } from '../labels';
import { orientationHint, useViewportOrientation } from '../orientation';
import type { SessionPort } from '../session';

/**
 * The phone should disappear: the TV is the source of truth. So this screen is nearly all
 * control — the player's name and one calm status, and nothing to read mid-game.
 */
export function PlayScreen({
  state,
  session,
}: {
  readonly state: ControllerState;
  readonly session: SessionPort;
}) {
  useInterruptionGuard(() => session.neutralize());
  const viewport = useViewportOrientation();
  const context = state.context?.context ?? 'GAMEPLAY';
  const badge = CONTEXT_BADGE[context];
  const hint = state.manifest ? orientationHint(state.manifest.orientation, viewport) : undefined;

  return (
    <main
      className="play"
      data-reconnecting={state.phase === 'RECONNECTING'}
      data-context={context}
    >
      <header className="play-header">
        <span className="player-name">{state.displayName}</span>
        {badge !== undefined && <span className="context-badge">{badge}</span>}
        <ConnectionBadge phase={state.phase} />
      </header>
      {hint ? (
        <p className="rotate-hint" role="note">
          {hint === 'LANDSCAPE'
            ? 'Rotate your phone to landscape for the best view.'
            : 'Rotate your phone to portrait (upright) for the best view.'}
        </p>
      ) : null}
      {state.manifest ? (
        <ControlRenderer
          manifest={state.manifest}
          context={context}
          secondaryAction={state.context?.secondaryAction ?? null}
          onControlChange={(controlId, value) => session.setControlValue(controlId, value)}
          onButtonChange={(controlId, pressed) => session.setButton(controlId, pressed)}
        />
      ) : null}
      {/* Purely visual: the badge above is the one live status for assistive technology. */}
      {state.phase === 'RECONNECTING' ? (
        <div className="reconnecting-veil" aria-hidden="true" />
      ) : null}
    </main>
  );
}
