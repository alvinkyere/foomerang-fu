import { useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  applySettings,
  loadSettings,
  saveSettings,
  type ShellSettings,
} from './settings';

const storage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined; // blocked site data: settings last for this visit
  }
};

/** Settings live for the page's life and are remembered across visits. Applied to <html> as they change. */
export function useSettings(): readonly [ShellSettings, (next: ShellSettings) => void] {
  const [settings, setSettings] = useState<ShellSettings>(() => loadSettings(storage()));
  useEffect(() => {
    applySettings(settings, document.documentElement);
    saveSettings(settings, storage());
  }, [settings]);
  return [settings, setSettings] as const;
}

export { DEFAULT_SETTINGS };
