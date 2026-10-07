import type { ReactNode } from 'react';
import { FocusScope } from '../focus/FocusManager';
import { usePresence } from './Presence';

export interface ModalProps {
  readonly id: string;
  readonly open: boolean;
  readonly title: string;
  /** Back (Esc / B) and the scrim both call this. There is always a way out. */
  readonly onClose: () => void;
  readonly initialFocus?: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}

/** A sheet over the current screen. Takes input while open; hands it straight back on close. */
export function Modal({ id, open, title, onClose, initialFocus, children, footer }: ModalProps) {
  const { mounted, closing } = usePresence(open, 200);
  if (!mounted) return null;
  return (
    <FocusScope
      id={id}
      active={open}
      onBack={onClose}
      {...(initialFocus ? { initialFocus } : {})}
      remember={false}
    >
      <div className="modal" data-state={closing ? 'closing' : 'open'}>
        <div className="modal__scrim" onClick={onClose} aria-hidden="true" />
        <section className="modal__sheet" role="dialog" aria-modal="true" aria-label={title}>
          <h2 className="modal__title">{title}</h2>
          <div className="modal__body">{children}</div>
          {footer && <div className="modal__footer">{footer}</div>}
        </section>
      </div>
    </FocusScope>
  );
}
