import type { ReactNode } from 'react';
import { useFocusItem } from '../focus/FocusManager';
import { Icon } from './Icon';

export function SettingsList({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="settings-list" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export interface SettingsRowProps {
  readonly id: string;
  readonly label: string;
  /** What the setting is now, shown on the right. */
  readonly value: string;
  /** 'choice' steps with ←/→ (and cycles on A); 'info' only reports; 'action' just activates. */
  readonly kind?: 'choice' | 'info' | 'action';
  /** Step the value: +1 / −1. Takes effect immediately. */
  readonly onStep?: (delta: 1 | -1) => void;
  readonly onActivate?: () => void;
  readonly onFocus?: () => void;
}

export function SettingsRow({
  id,
  label,
  value,
  kind = 'choice',
  onStep,
  onActivate,
  onFocus,
}: SettingsRowProps) {
  const item = useFocusItem<HTMLButtonElement>(id, {
    onNavigate: (direction) => {
      if (kind !== 'choice' || onStep === undefined) return false;
      if (direction === 'left') onStep(-1);
      else if (direction === 'right') onStep(1);
      else return false;
      return true;
    },
  });
  return (
    <button
      type="button"
      {...item}
      className={`row row--${kind}`}
      aria-readonly={kind === 'info' || undefined}
      onFocus={onFocus}
      onClick={() => (kind === 'choice' ? onStep?.(1) : onActivate?.())}
    >
      <span className="row__label">{label}</span>
      <span className="row__value">
        {kind === 'choice' && <Icon name="chevron-left" className="row__chev" />}
        <span key={value} className="row__text is-changed">
          {value}
        </span>
        {kind === 'choice' && <Icon name="chevron-right" className="row__chev" />}
        {kind === 'action' && <Icon name="chevron-right" className="row__chev row__chev--always" />}
      </span>
    </button>
  );
}
