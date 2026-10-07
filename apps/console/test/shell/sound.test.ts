import { describe, expect, it, vi } from 'vitest';
import { createSoundHooks } from '../../src/shell/sound';

describe('sound hooks', () => {
  it('is silent until something listens, and never throws without listeners', () => {
    const hooks = createSoundHooks();
    expect(() => hooks.emit('move')).not.toThrow();
  });
  it('delivers cues to every listener and stops after unsubscribe', () => {
    const hooks = createSoundHooks();
    const a = vi.fn();
    const off = hooks.on(a);
    hooks.emit('select');
    off();
    hooks.emit('back');
    expect(a).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith('select');
  });
  it('a throwing listener cannot break navigation', () => {
    const hooks = createSoundHooks();
    const ok = vi.fn();
    hooks.on(() => {
      throw new Error('audio device gone');
    });
    hooks.on(ok);
    expect(() => hooks.emit('move')).not.toThrow();
    expect(ok).toHaveBeenCalled();
  });
});
