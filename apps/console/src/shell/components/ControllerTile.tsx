import type { CSSProperties } from 'react';
import { Icon } from './Icon';

export type ControllerState = 'connected' | 'reconnecting' | 'disconnected';
const TEXT: Readonly<Record<ControllerState, string>> = {
  connected: 'Connected',
  reconnecting: 'Rejoining…',
  disconnected: 'Not connected',
};

/** A phone-controller and how well it is hanging on. Consumer wording only — never network terms. */
export function ControllerTile({
  name,
  color,
  state,
}: {
  readonly name: string;
  readonly color: string;
  readonly state: ControllerState;
}) {
  return (
    <div className={`ctile ctile--${state}`} style={{ '--seat': color } as CSSProperties}>
      <Icon name="phone" className="ctile__icon" />
      <span className="ctile__name">{name}</span>
      <span
        className={`chip chip--${state === 'connected' ? 'connected' : state === 'reconnecting' ? 'reconnecting' : 'away'}`}
      >
        <span className="chip__dot" aria-hidden="true" />
        <span>{TEXT[state]}</span>
      </span>
    </div>
  );
}
