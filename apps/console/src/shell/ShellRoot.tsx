import { useEffect, type ReactNode } from 'react';
import { ToastHost } from './components';
import { FocusManager } from './focus/FocusManager';
import './tokens.css';
import './components.css';

/**
 * Everything the console shell needs around its screens: focus and input, toasts, and the root
 * text size (which only the shell changes; the arena keeps its own).
 */
export function ShellRoot({ children }: { readonly children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset['view'] = 'shell';
    return () => {
      delete document.documentElement.dataset['view'];
      delete document.documentElement.dataset['input'];
    };
  }, []);
  return (
    <FocusManager>
      <ToastHost>
        <div className="fc">{children}</div>
      </ToastHost>
    </FocusManager>
  );
}
