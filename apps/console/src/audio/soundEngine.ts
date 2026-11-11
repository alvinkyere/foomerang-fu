import type { ArenaView } from '../render/viewModel';
import { soundHooks, type SoundCue } from '../shell/sound';
import { CUE_SOUNDS, EVENT_SOUNDS, EXTRA_SOUNDS, type ExtraSound, type Recipe } from './recipes';
import { createBuses, playRecipe } from './synth';

/** Where the context comes from (the browser's; a test hands in a fake, or none). */
export type ContextFactory = () => AudioContext | undefined;

/** Most sounds sounding at once: a pile-up of events must not turn to noise. */
const MAX_VOICES = 40;
/** Least seconds between two sounds of one kind. */
const MIN_GAP = 0.035;
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

const defaultFactory: ContextFactory = () => {
  try {
    return typeof AudioContext === 'undefined' ? undefined : new AudioContext();
  } catch {
    return undefined;
  }
};

/**
 * The game's sound effects: one for every match event, and the menus' blips (the music is the owner's tracks: musicPlayer.ts). It listens; it
 * never decides anything (the rules do not know it exists). Browsers keep audio locked until a key or a tap, so the context
 * is resumed on the first one (and tried again while it waits). OFF BY DEFAULT (the owner, 2026-10-28: "it's bad, turn it off"):
 * `?sound=on` turns it on, until the sounds are right.
 */
export class SoundEngine {
  readonly #factory: ContextFactory;
  readonly #enabled: boolean;
  #ctx: AudioContext | undefined;
  #sfx: GainNode | undefined;
  #listening = false;
  #active = 0;
  #played = 0;
  #lastTry = 0;
  readonly #last = new Map<string, number>();
  readonly #boomerangs = new Map<string, string>();
  #champion: string | undefined;
  readonly #unlock = (): void => void this.#ctx?.resume().catch(() => undefined);

  constructor(factory: ContextFactory = defaultFactory, enabled = true) {
    this.#factory = factory;
    this.#enabled = enabled;
    soundHooks.on((cue) => this.cue(cue));
  }

  /** Voices made so far (for tests and for telling a silent build from a broken one). */
  get played(): number {
    return this.#played;
  }

  /** An arena is up: wait for the first key or tap if the browser is still holding the sound back. */
  start(): void {
    if (!this.#enabled || this.#listening) return;
    if (this.#context() === undefined) return;
    for (const type of UNLOCK_EVENTS) globalThis.addEventListener?.(type, this.#unlock);
    this.#listening = true;
  }

  /** The arena is gone (the effects of the menus stay available). */
  stop(): void {
    this.#listening = false;
    for (const type of UNLOCK_EVENTS) globalThis.removeEventListener?.(type, this.#unlock);
    this.#boomerangs.clear();
    this.#champion = undefined;
  }

  /** One frame's view: a sound for each event in it, and for what the boomerangs and the match did since the last. */
  frame(view: ArenaView): void {
    if (!this.#enabled) return;
    const pan = (x: number): number => Math.max(-0.7, Math.min(0.7, (x / view.width - 0.5) * 1.4));
    for (const e of view.events) this.#play(EVENT_SOUNDS[e.type], e.type, pan(e.x));
    const seen = new Set<string>();
    for (const b of view.boomerangs) {
      seen.add(b.id);
      const before = this.#boomerangs.get(b.id);
      this.#boomerangs.set(b.id, b.state);
      if (before === undefined || before === b.state) continue;
      if (b.state === 'RETURNING') this.#extra('return', pan(b.x));
      else if (b.state === 'RECALLING') this.#extra('recall', pan(b.x));
    }
    for (const id of [...this.#boomerangs.keys()]) if (!seen.has(id)) this.#boomerangs.delete(id);
    const champion = view.hud?.champion?.id;
    if (champion !== undefined && this.#champion === undefined) this.#extra('win', 0);
    this.#champion = champion;
  }

  /** A menu moved, chose, closed...: its blip. */
  cue(cue: SoundCue): void {
    if (!this.#enabled) return;
    this.#play(CUE_SOUNDS[cue], `cue:${cue}`, 0);
  }

  #extra(name: ExtraSound, pan: number): void {
    this.#play(EXTRA_SOUNDS[name], name, pan);
  }

  /** The context, made on first use with its buses (synth.ts: effects and music into one limiter so nothing clips). */
  #context(): AudioContext | undefined {
    if (this.#ctx !== undefined) return this.#ctx;
    const ctx = this.#factory();
    if (ctx === undefined) return undefined;
    const buses = createBuses(ctx);
    this.#sfx = buses.sfx;
    this.#ctx = ctx;
    return ctx;
  }

  #running(): AudioContext | undefined {
    const ctx = this.#context();
    if (ctx === undefined) return undefined;
    if (ctx.state === 'running') return ctx;
    const now = Date.now();
    if (now - this.#lastTry > 1000) {
      this.#lastTry = now;
      ctx.resume().catch(() => undefined); // (a gamepad press may be the first activation the browser sees)
    }
    return undefined;
  }

  #play(recipe: Recipe, key: string, pan: number): void {
    const ctx = this.#running();
    const bus = this.#sfx;
    if (ctx === undefined || bus === undefined) return;
    const when = ctx.currentTime + 0.005;
    const last = this.#last.get(key);
    if (last !== undefined && when - last < MIN_GAP) return;
    if (this.#active >= MAX_VOICES) return;
    this.#last.set(key, when);
    let out: AudioNode = bus;
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      panner.connect(bus);
      out = panner;
    }
    this.#played += 1;
    this.#active += 1;
    // a touch of variety, the same each run: no two throws in a row are exactly alike
    const pitch = 1 + (((this.#played * 37) % 11) - 5) / 200;
    playRecipe(ctx, out, recipe, when, recipe.level ?? 1, pitch, () => {
      this.#active -= 1;
    });
  }
}

const wanted =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('sound') === 'on';
export const soundEngine = new SoundEngine(defaultFactory, wanted);
