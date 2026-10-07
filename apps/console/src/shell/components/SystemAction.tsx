import type { CSSProperties } from 'react';
import { useFocusItem } from '../focus/FocusManager';
import { Icon, type IconName } from './Icon';

export interface SystemActionProps {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  /** Identity colour of the destination. */
  readonly accent: string;
  readonly onSelect: () => void;
}

/** One system destination: a round icon button; the focused one fills with its colour and names itself. */
export function SystemAction({ id, label, icon, accent, onSelect }: SystemActionProps) {
  const item = useFocusItem<HTMLButtonElement>(id);
  return (
    <button
      type="button"
      {...item}
      className="sysaction"
      style={{ '--accent-id': accent } as CSSProperties}
      onClick={onSelect}
    >
      <span className="sysaction__disc">
        <Icon name={icon} />
      </span>
      <span className="sysaction__label">{label}</span>
    </button>
  );
}

export function SystemBar({ children }: { readonly children: React.ReactNode }) {
  return (
    <nav className="sysbar" aria-label="System">
      {children}
    </nav>
  );
}
