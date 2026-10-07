import { useFocusItem } from '../focus/FocusManager';
import type { ReactNode } from 'react';

export interface GameTileProps {
  readonly id: string;
  readonly title: string;
  /** Production artwork. A tile without art is a COMING SOON tile. */
  readonly art?: string | undefined;
  readonly comingSoon?: boolean;
  readonly onSelect: () => void;
  readonly onFocus?: () => void;
  /** Overlaid on the artwork (a wordmark). */
  readonly children?: ReactNode;
  readonly width?: 'wide' | 'square';
}

/** A game cover. Focus is selection: it lifts, scales, gets the accent ring and shows its name. */
export function GameTile({
  id,
  title,
  art,
  comingSoon = false,
  onSelect,
  onFocus,
  children,
  width = 'wide',
}: GameTileProps) {
  const item = useFocusItem<HTMLButtonElement>(id);
  return (
    <div className={`tile-wrap tile-wrap--${width}`}>
      <div className="tile-label" aria-hidden="true">
        {title}
      </div>
      <button
        type="button"
        {...item}
        className={`tile${comingSoon ? ' tile--soon' : ''}`}
        aria-label={comingSoon ? `${title}, coming soon` : title}
        onFocus={onFocus}
        onClick={onSelect}
      >
        {art !== undefined && <img className="tile__art" src={art} alt="" draggable={false} />}
        {comingSoon && (
          <span className="tile__soon" aria-hidden="true">
            <svg viewBox="0 0 120 120">
              <path d="M18 92C18 46 52 18 104 20c-18 12-23 28-19 56-15-14-35-15-67 16Z" />
            </svg>
          </span>
        )}
        <span className="tile__shade" aria-hidden="true" />
        <span className="tile__overlay">{children}</span>
        {comingSoon && <span className="tile__badge">COMING SOON</span>}
      </button>
    </div>
  );
}
