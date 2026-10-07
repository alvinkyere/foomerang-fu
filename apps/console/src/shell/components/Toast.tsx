import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { soundHooks } from '../sound';
import { Icon } from './Icon';

export type ToastTone = 'info' | 'good' | 'bad';
interface ToastItem {
  readonly id: number;
  readonly message: string;
  readonly tone: ToastTone;
}

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

const LIFETIME_MS = 3200;

/** Short, non-blocking messages. Polite live region; never takes focus. */
export function ToastHost({ children }: { readonly children: ReactNode }) {
  const [items, setItems] = useState<readonly ToastItem[]>([]);
  const show = useCallback((message: string, tone: ToastTone = 'info') => {
    soundHooks.emit(tone === 'bad' ? 'error' : 'open');
    setItems((prev) => [...prev.slice(-2), { id: Date.now() + Math.random(), message, tone }]);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((item) => (
          <ToastView
            key={item.id}
            item={item}
            onDone={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, LIFETIME_MS);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className={`toast toast--${item.tone}`}>
      <Icon name={item.tone === 'bad' ? 'warning' : item.tone === 'good' ? 'check' : 'about'} />
      <span>{item.message}</span>
    </div>
  );
}
