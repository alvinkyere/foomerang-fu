import type { ReactNode } from 'react';
import { useFocusItem } from '../focus/FocusManager';
import { Icon, type IconName } from './Icon';

export interface ButtonProps {
  readonly id: string;
  readonly children: ReactNode;
  readonly onPress: () => void;
  readonly variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  readonly size?: 'm' | 'l';
  readonly icon?: IconName;
  /** Unavailable: still focusable (so it can say why), never activatable. */
  readonly disabled?: boolean;
  /** Working: unavailable too, and shows a spinner. */
  readonly loading?: boolean;
  readonly onFocus?: () => void;
  readonly describedBy?: string;
}

/**
 * The one button. States: default, focused (:focus), pressed (:active, or data-pressed from a
 * keyboard / gamepad press), disabled, loading. Disabled buttons use aria-disabled so they remain
 * reachable; a screen shows the reason next to them.
 */
export function Button({
  id,
  children,
  onPress,
  variant = 'secondary',
  size = 'm',
  icon,
  disabled = false,
  loading = false,
  onFocus,
  describedBy,
}: ButtonProps) {
  const item = useFocusItem<HTMLButtonElement>(id);
  const unavailable = disabled || loading;
  return (
    <button
      type="button"
      {...item}
      className={`btn btn--${variant} btn--${size}`}
      aria-disabled={unavailable || undefined}
      aria-busy={loading || undefined}
      aria-describedby={describedBy}
      data-loading={loading || undefined}
      onFocus={onFocus}
      onClick={() => {
        if (!unavailable) onPress();
      }}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : icon && <Icon name={icon} />}
      <span className="btn__label">{children}</span>
    </button>
  );
}
