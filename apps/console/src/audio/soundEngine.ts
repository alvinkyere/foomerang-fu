import type { ArenaView } from '../render/viewModel';
import { soundHooks, type SoundCue } from '../shell/sound';
import { EIGHTH, hitRecipe, hitsAt } from './music';
import { CUE_SOUNDS, EVENT_SOUNDS, EXTRA_SOUNDS, type ExtraSound, type Recipe } from './recipes';
import { createBuses, playRecipe } from './synth';

/** Where the context comes from (the browser's; a test hands in a fake, or none). */
export type ContextFactory = () => AudioContext | undefined;

/** Most sounds sounding at once: a pile-up of events must not turn to noise. */
const MAX_VOICES = 40;
/** Least seconds between two sounds of one kind. */
const MIN_GAP = 0.035;
/** How far ahead the music is scheduled, and how often. */
const AHEAD = 0.35;
const TICK_MS = 100;
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

const defaultFactory: ContextFactory = () => {
  try {
    return typeof AudioContext === 'undefined' ? undefined : new AudioContext();
  } catch {
    return undefined;
  }
};

/**
 * The game's sound: a music bed while an arena is up, an effect for every match event, and the menus' blips. It listens; it
 * never decides anything (the rules do not know it exists). Browsers keep audio locked until a key or a tap, so the context
 * is resumed on the first one (and tried again while it waits). OFF BY DEFAULT (the owner, 2026-10-28: "it's bad, turn it off"):
 * `?sound=on` turns it on, until the sounds are right.
 */
export class SoundEngine {
  readonly #factory: ContextFactory;
  readonly #enabled: boolean;
  #ctx: AudioContext | undefined;
  #sfx: GainNode | undefined;
  #music: GainNode | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;
  #eighth = 0;
  #nextTime = 0;
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

  /** An arena is up: wait for the first key or tap if the browser is still holding the sound back, and start the music. */
  start(): void {
    if (!this.#enabled || this.#timer !== undefined) return;
    if (this.#context() === undefined) return;
    for (const type of UNLOCK_EVENTS) globalThis.addEventListener?.(type, this.#unlock);
    this.#nextTime = 0;
    this.#timer = setInterval(() => this.#tick(), TICK_MS);
    this.#tick();
  }

  /** The arena is gone: the music stops (the effects of the menus stay available). */
  stop(): void {
    if (this.#timer !== undefined) clearInterval(this.#timer);
    this.#timer = undefined;
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
    this.#music = buses.music;
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

  /** Keeps the music a little ahead of the clock: each eighth's hits are scheduled at its exact time. */
  #tick(): void {
    const ctx = this.#running();
    const bus = this.#music;
    if (ctx === undefined || bus === undefined) return;
    // first time (or after a long stall: a hidden tab): start again from now rather than playing the backlog at once
    if (this.#nextTime === 0 || this.#nextTime < ctx.currentTime - 0.5)
      this.#nextTime = ctx.currentTime + 0.06;
    while (this.#nextTime < ctx.currentTime + AHEAD) {
      for (const hit of hitsAt(this.#eighth)) playRecipe(ctx, bus, hitRecipe(hit), this.#nextTime);
      this.#eighth += 1;
      this.#nextTime += EIGHTH;
    }
  }
}

const wanted =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('sound') === 'on';
export const soundEngine = new SoundEngine(defaultFactory, wanted);
