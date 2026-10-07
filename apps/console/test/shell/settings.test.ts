import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  applySettings,
  loadSettings,
  saveSettings,
  stepSetting,
} from '../../src/shell/settings';

describe('shell settings', () => {
  it('steps through a setting’s values and wraps both ways', () => {
    expect(stepSetting(DEFAULT_SETTINGS, 'textSize', 1).textSize).toBe('large');
    expect(stepSetting(DEFAULT_SETTINGS, 'textSize', -1).textSize).toBe('xlarge');
    const wrapped = stepSetting({ ...DEFAULT_SETTINGS, textSize: 'xlarge' }, 'textSize', 1);
    expect(wrapped.textSize).toBe('normal');
  });

  it('does not mutate the settings it was given', () => {
    const before = { ...DEFAULT_SETTINGS };
    stepSetting(before, 'highContrast', 1);
    expect(before).toEqual(DEFAULT_SETTINGS);
  });

  it('applies every setting to the document root at once', () => {
    const root = document.createElement('html');
    applySettings(
      {
        ...DEFAULT_SETTINGS,
        reducedMotion: 'on',
        highContrast: 'on',
        textSize: 'large',
        margin: 'medium',
      },
      root,
    );
    expect(root.dataset['reducedMotion']).toBe('true');
    expect(root.dataset['contrast']).toBe('high');
    expect(root.dataset['textSize']).toBe('large');
    expect(root.dataset['margin']).toBe('medium');
  });

  it('follows the system reduced-motion preference until the player chooses', () => {
    const root = document.createElement('html');
    applySettings(DEFAULT_SETTINGS, root);
    expect(root.dataset['reducedMotion']).toBeUndefined();
    applySettings({ ...DEFAULT_SETTINGS, reducedMotion: 'off' }, root);
    expect(root.dataset['reducedMotion']).toBe('false');
  });

  it('round-trips through storage and ignores corrupt or hostile stored data', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    saveSettings({ ...DEFAULT_SETTINGS, margin: 'large' }, storage);
    expect(loadSettings(storage).margin).toBe('large');
    store.set('foomerang.shell.settings', '{"margin":"<script>","textSize":42,"extra":1}');
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    store.set('foomerang.shell.settings', 'not json');
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('survives storage that throws', () => {
    const angry = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadSettings(angry)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS, angry)).not.toThrow();
  });
});
