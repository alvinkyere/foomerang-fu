/**
 * Console settings that are real today: each one changes the shell the moment it is stepped. Rows
 * for things that are not wired yet (audio, screen shake, effects) are deliberately absent — a
 * setting that does nothing is worse than no setting.
 */
export interface ShellSettings {
  readonly margin: 'off' | 'small' | 'medium' | 'large';
  readonly textSize: 'normal' | 'large' | 'xlarge';
  readonly reducedMotion: 'system' | 'on' | 'off';
  readonly highContrast: 'off' | 'on';
  readonly controlHints: 'auto' | 'keyboard' | 'gamepad';
}

export const SETTING_VALUES: { readonly [K in keyof ShellSettings]: readonly ShellSettings[K][] } =
  {
    margin: ['off', 'small', 'medium', 'large'],
    textSize: ['normal', 'large', 'xlarge'],
    reducedMotion: ['system', 'on', 'off'],
    highContrast: ['off', 'on'],
    controlHints: ['auto', 'keyboard', 'gamepad'],
  };

export const DEFAULT_SETTINGS: ShellSettings = {
  margin: 'off',
  textSize: 'normal',
  reducedMotion: 'system',
  highContrast: 'off',
  controlHints: 'auto',
};

export function stepSetting<K extends keyof ShellSettings>(
  settings: ShellSettings,
  key: K,
  delta: 1 | -1,
): ShellSettings {
  const values = SETTING_VALUES[key];
  const index = values.indexOf(settings[key]);
  const next = values[(index + delta + values.length) % values.length] as ShellSettings[K];
  return { ...settings, [key]: next };
}

/** Writes the settings onto <html>, where tokens.css reads them. */
export function applySettings(settings: ShellSettings, root: HTMLElement): void {
  const set = (name: string, value: string | undefined): void => {
    if (value === undefined)
      root.removeAttribute(`data-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
    else root.dataset[name] = value;
  };
  set('margin', settings.margin === 'off' ? undefined : settings.margin);
  set('textSize', settings.textSize === 'normal' ? undefined : settings.textSize);
  set('contrast', settings.highContrast === 'on' ? 'high' : undefined);
  set(
    'reducedMotion',
    settings.reducedMotion === 'system'
      ? undefined
      : settings.reducedMotion === 'on'
        ? 'true'
        : 'false',
  );
}

const KEY = 'foomerang.shell.settings';
interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Stored data is never trusted: every field must be one of its known values, or it is the default. */
export function loadSettings(storage: StorageLike | undefined): ShellSettings {
  try {
    const raw = storage?.getItem(KEY);
    if (raw === null || raw === undefined) return DEFAULT_SETTINGS;
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return DEFAULT_SETTINGS;
    const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(SETTING_VALUES) as (keyof ShellSettings)[]) {
      const value = (data as Record<string, unknown>)[key];
      if ((SETTING_VALUES[key] as readonly unknown[]).includes(value)) out[key] = value;
    }
    return out as unknown as ShellSettings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ShellSettings, storage: StorageLike | undefined): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // blocked site data: the settings simply last for this visit
  }
}
