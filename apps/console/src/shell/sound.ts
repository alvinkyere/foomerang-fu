/**
 * Sound HOOKS, not sounds: the shell announces what just happened and anything may listen. No
 * audio ships yet; a later slice attaches an audio engine here without touching a component.
 */
export type SoundCue =
  'move' | 'select' | 'back' | 'open' | 'close' | 'toggle' | 'error' | 'join' | 'start';

export interface SoundHooks {
  emit(cue: SoundCue): void;
  on(listener: (cue: SoundCue) => void): () => void;
}

export function createSoundHooks(): SoundHooks {
  const listeners = new Set<(cue: SoundCue) => void>();
  return {
    emit(cue) {
      for (const listener of [...listeners]) {
        try {
          listener(cue);
        } catch {
          // an audio failure must never interrupt navigation
        }
      }
    },
    on(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export const soundHooks: SoundHooks = createSoundHooks();
