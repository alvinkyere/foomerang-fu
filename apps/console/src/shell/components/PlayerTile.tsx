import type { CSSProperties } from 'react';
import { useFocusItem } from '../focus/FocusManager';
import { Character, type CharacterId } from './Characters';
import { Icon } from './Icon';

export type PlayerStatus = 'connected' | 'reconnecting' | 'away';

export interface PlayerTileProps {
  readonly id: string;
  /** Seat colour, number and shape — the three always travel together. */
  readonly color: string;
  readonly number: number;
  readonly marker: string;
  readonly kind: 'phone' | 'cpu' | 'empty';
  readonly name?: string;
  readonly character?: CharacterId;
  readonly status?: PlayerStatus;
  /** CPU only: its difficulty, e.g. "Medium". */
  readonly detail?: string;
  /** Focusable tiles act (add / remove a CPU, change difficulty). */
  readonly onSelect?: () => void;
  readonly onStep?: (delta: 1 | -1) => void;
  readonly actionHint?: string;
}

const STATUS_TEXT: Readonly<Record<PlayerStatus, string>> = {
  connected: 'Connected',
  reconnecting: 'Rejoining…',
  away: 'Away',
};

/** One seat at the table: who is in it, what they look like, and whether they are really there. */
export function PlayerTile({
  id,
  color,
  number,
  marker,
  kind,
  name,
  character,
  status = 'connected',
  detail,
  onSelect,
  onStep,
  actionHint,
}: PlayerTileProps) {
  const interactive = onSelect !== undefined;
  const item = useFocusItem<HTMLButtonElement>(id, {
    onNavigate: (direction) => {
      if (kind !== 'cpu' || onStep === undefined) return false;
      if (direction === 'left') onStep(-1);
      else if (direction === 'right') onStep(1);
      else return false;
      return true;
    },
  });
  const body = (
    <>
      <span className="seat" aria-hidden="true">
        <span className="seat__num">{number}</span>
        <span className="seat__mark">{marker}</span>
      </span>
      {kind === 'empty' ? (
        <span className="ptile__empty">
          <span className="ptile__empty-title">Waiting for a phone…</span>
          {actionHint !== undefined && <span className="ptile__empty-hint">{actionHint}</span>}
        </span>
      ) : (
        <>
          <span className={`ptile__avatar${status === 'reconnecting' ? ' is-dim' : ''}`}>
            {character !== undefined && <Character id={character} />}
          </span>
          <span className="ptile__text">
            <span className="ptile__who">
              <span className="ptile__name">{name}</span>
              {kind === 'cpu' && <span className="tag">CPU</span>}
            </span>
            <span
              className={`chip chip--${status}`}
              aria-label={kind === 'cpu' ? `CPU, ${detail}` : undefined}
            >
              {kind === 'cpu' ? (
                <>
                  <Icon name="chevron-left" className="chip__step" />
                  <span>{detail}</span>
                  <Icon name="chevron-right" className="chip__step" />
                </>
              ) : (
                <>
                  <span className="chip__dot" aria-hidden="true" />
                  <span>{STATUS_TEXT[status]}</span>
                </>
              )}
            </span>
          </span>
        </>
      )}
    </>
  );
  const className = `ptile ptile--${kind} ptile--${status}`;
  const style = { '--seat': color } as CSSProperties;
  if (!interactive) {
    return (
      <div
        className={className}
        style={style}
        role="group"
        aria-label={`Player ${number}${name ? `: ${name}` : ', empty'}`}
      >
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      {...item}
      className={className}
      style={style}
      aria-label={`Player ${number}: ${name ?? 'empty seat'}`}
      onClick={onSelect}
    >
      {body}
    </button>
  );
}
