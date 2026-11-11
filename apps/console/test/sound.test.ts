import { afterEach, describe, expect, it, vi } from 'vitest';
import { CUE_SOUNDS, EVENT_SOUNDS, EXTRA_SOUNDS, type Recipe } from '../src/audio/recipes';
import { SoundEngine } from '../src/audio/soundEngine';
import { recipeSeconds } from '../src/audio/synth';
import type { ArenaView } from '../src/render/viewModel';

// The game's sound (owner, 2026-10-28: "get the sound for everything and implement it"): our own synthesis, one recipe for
// each match event (the music is the owner's tracks since 2026-11-11: musicPlaylist.test.ts, musicPlayer.test.ts).

const ALL: [string, Recipe][] = [
  ...Object.entries(EVENT_SOUNDS),
  ...Object.entries(EXTRA_SOUNDS),
  ...Object.entries(CUE_SOUNDS),
];

describe('the recipes', () => {
  it.each(ALL)('%s is a short, bounded sound', (_name, r) => {
    expect(r.voices.length).toBeGreaterThan(0);
    expect(recipeSeconds(r)).toBeLessThanOrEqual(1.5); // (the win fanfare is the longest: 1.4 s)
    for (const v of r.voices) {
      expect(v.gain).toBeGreaterThan(0);
      expect(v.gain).toBeLessThanOrEqual(1);
      expect(v.decay).toBeGreaterThan(0);
      for (const f of [v.from, v.to, v.filter?.from, v.filter?.to])
        if (f !== undefined) {
          expect(f).toBeGreaterThanOrEqual(20);
          expect(f).toBeLessThanOrEqual(12_000);
        }
    }
  });
});

// a hand-made AudioContext that only counts what is started
const param = () => ({
  value: 0,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
});
const node = () => ({
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  gain: param(),
  frequency: param(),
  Q: param(),
  pan: param(),
  threshold: param(),
  knee: param(),
  ratio: param(),
  attack: param(),
  release: param(),
});
function fakeContext(state: 'running' | 'suspended' = 'running') {
  const started = { oscillators: 0, noises: 0 };
  let time = 0;
  const ctx = {
    state,
    sampleRate: 8000,
    get currentTime() {
      return time;
    },
    destination: node(),
    resume: vi.fn(() => Promise.resolve()),
    createGain: node,
    createDynamicsCompressor: node,
    createBiquadFilter: node,
    createStereoPanner: node,
    createBuffer: (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) }),
    createOscillator: () => {
      started.oscillators += 1;
      return node();
    },
    createBufferSource: () => {
      started.noises += 1;
      return node();
    },
  };
  return {
    ctx: ctx as unknown as AudioContext,
    started,
    advance: (s: number) => void (time += s),
    raw: ctx,
  };
}

const view = (over: Partial<ArenaView> = {}): ArenaView =>
  ({ width: 1000, events: [], boomerangs: [], hud: undefined, ...over }) as unknown as ArenaView;
const boom = (id: string, state: string) => ({ id, state, x: 500, y: 0 });

describe('the sound engine', () => {
  afterEach(() => vi.useRealTimers());

  it('plays a sound for an event, panned by where it happened', () => {
    const f = fakeContext();
    const engine = new SoundEngine(() => f.ctx);
    engine.frame(view({ events: [{ type: 'THROWN', x: 100, y: 0, color: '#fff' }] as never }));
    expect(engine.played).toBe(1);
    expect(f.started.oscillators + f.started.noises).toBeGreaterThan(0);
  });

  it('plays every kind of event', () => {
    const f = fakeContext();
    const engine = new SoundEngine(() => f.ctx);
    const types = Object.keys(EVENT_SOUNDS);
    const events = types.map((type) => ({ type, x: 500, y: 0, color: '#fff' }));
    engine.frame(view({ events: events as never }));
    expect(engine.played).toBe(types.length);
  });

  it('keeps one kind of sound from stacking on itself in the same instant', () => {
    const f = fakeContext();
    const engine = new SoundEngine(() => f.ctx);
    const e = { type: 'HIT', x: 500, y: 0, color: '#fff' };
    engine.frame(view({ events: [e, e, e] as never }));
    expect(engine.played).toBe(1);
  });

  it('a boomerang turning for home, and one called back, each have their sound', () => {
    const f = fakeContext();
    const engine = new SoundEngine(() => f.ctx);
    engine.frame(view({ boomerangs: [boom('a', 'THROWN'), boom('b', 'THROWN')] as never }));
    expect(engine.played).toBe(0); // (a new boomerang is the THROWN event's, not a change)
    f.advance(1);
    engine.frame(view({ boomerangs: [boom('a', 'RETURNING'), boom('b', 'RECALLING')] as never }));
    expect(engine.played).toBe(2);
    f.advance(1);
    engine.frame(view({ boomerangs: [boom('a', 'RETURNING'), boom('b', 'RECALLING')] as never }));
    expect(engine.played).toBe(2); // (no change, no sound)
  });

  it('a fanfare once, when the match has a champion', () => {
    const f = fakeContext();
    const engine = new SoundEngine(() => f.ctx);
    engine.frame(view());
    f.advance(1);
    engine.frame(view({ hud: { champion: { id: 'a' } } as never }));
    f.advance(1);
    engine.frame(view({ hud: { champion: { id: 'a' } } as never }));
    expect(engine.played).toBe(1);
  });

  it('the menus have their blips', () => {
    const f = fakeContext();
    const engine = new SoundEngine(() => f.ctx);
    engine.cue('select');
    expect(engine.played).toBe(1);
  });

  it('plays no music of its own: an arena starting makes no sound until something happens (the music is the owner’s tracks)', () => {
    vi.useFakeTimers();
    const f = fakeContext();
    const engine = new SoundEngine(() => f.ctx);
    engine.start();
    for (let i = 0; i < 20; i += 1) {
      f.advance(0.1);
      vi.advanceTimersByTime(100);
    }
    expect(f.started.oscillators + f.started.noises).toBe(0);
    engine.stop();
  });

  it('is silent while the browser holds the sound back, and asks to be resumed', () => {
    const f = fakeContext('suspended');
    const engine = new SoundEngine(() => f.ctx);
    engine.frame(view({ events: [{ type: 'THROWN', x: 0, y: 0, color: '#fff' }] as never }));
    expect(engine.played).toBe(0);
    expect(f.raw.resume).toHaveBeenCalled();
  });

  it('is silent when switched off, and when there is no audio at all', () => {
    const f = fakeContext();
    const off = new SoundEngine(() => f.ctx, false);
    off.start();
    off.cue('select');
    off.frame(view({ events: [{ type: 'HIT', x: 0, y: 0, color: '#fff' }] as never }));
    expect(off.played).toBe(0);
    const none = new SoundEngine(() => undefined);
    none.start();
    none.cue('select');
    none.frame(view({ events: [{ type: 'HIT', x: 0, y: 0, color: '#fff' }] as never }));
    expect(none.played).toBe(0);
  });
});
