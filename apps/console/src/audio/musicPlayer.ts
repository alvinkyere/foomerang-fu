import { FADE, Playlist, crossfade, trackVolume, type MusicScene, type Track } from './playlist';

/** What the player needs of an audio element (the browser's HTMLAudioElement; a test hands in a fake). */
export interface AudioLike {
  src: string;
  volume: number;
  preload: string;
  readonly currentTime: number;
  readonly paused: boolean;
  /** A promise in today's browsers; nothing in older ones (and in jsdom). */
  play(): Promise<void> | undefined;
  pause(): void;
  removeAttribute(name: 'src'): void;
  load(): void;
}

/** A screen change must hold this long before the music follows it (a round's arena is torn down and set up again at once). */
export const SETTLE = 0.4;
const TICK_MS = 100;
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

interface Deck {
  readonly track: Track;
  readonly el: AudioLike;
  /** Fading in or out, from `at` (seconds) for `seconds`; none: at full. */
  fade: { dir: 'in' | 'out'; at: number; seconds: number } | undefined;
}

/**
 * The music (playlist.ts says what and how loud): one track at a time, crossfaded into the next (equal power) when the
 * screen moves between the menus and a match, and a few seconds before a track ends (the next of the same scene). Browsers
 * hold audio back until a key or a tap: whatever should be playing starts on the first one. ON by default; `?music=off`
 * silences it.
 */
export class MusicPlayer {
  readonly #make: () => AudioLike | undefined;
  readonly #now: () => number;
  readonly #playlist: Playlist;
  readonly #base: string;
  readonly #enabled: boolean;
  #decks: Deck[] = [];
  #scene: MusicScene | undefined;
  #wanted: MusicScene | undefined;
  #wantedAt = 0;
  #timer: ReturnType<typeof setInterval> | undefined;
  readonly #unlock = (): void => {
    for (const d of this.#decks) if (d.el.paused) this.#play(d.el);
  };

  constructor(opts: {
    make: () => AudioLike | undefined;
    now: () => number;
    playlist?: Playlist;
    base?: string;
    enabled?: boolean;
  }) {
    this.#make = opts.make;
    this.#now = opts.now;
    this.#playlist = opts.playlist ?? new Playlist();
    this.#base = opts.base ?? '/';
    this.#enabled = opts.enabled ?? true;
  }

  /** The track playing (the one fading in, during a handover). */
  get playing(): Track | undefined {
    return this.#decks.at(-1)?.track;
  }

  /** How many tracks are sounding (2 during a handover). */
  get sounding(): number {
    return this.#decks.length;
  }

  /** Starts the clock (and listens for the first key or tap). */
  start(): void {
    if (!this.#enabled || this.#timer !== undefined) return;
    for (const type of UNLOCK_EVENTS) globalThis.addEventListener?.(type, this.#unlock);
    this.#timer = setInterval(() => this.tick(), TICK_MS);
  }

  /** The screen the music should follow. */
  want(scene: MusicScene): void {
    if (!this.#enabled || scene === this.#wanted) return;
    this.#wanted = scene;
    this.#wantedAt = this.#now();
    if (this.#scene === undefined) this.tick();
  }

  /** One step: follow the screen once it has settled, hand over before a track ends, move the fades on. */
  tick(): void {
    if (!this.#enabled) return;
    const now = this.#now();
    const wanted = this.#wanted;
    if (
      wanted !== undefined &&
      wanted !== this.#scene &&
      (this.#scene === undefined || now - this.#wantedAt >= SETTLE)
    ) {
      this.#handOver(wanted, this.#scene === undefined ? 0 : FADE.scene, now);
      this.#scene = wanted;
    }
    const current = this.#decks.at(-1);
    if (current !== undefined && current.fade?.dir !== 'out' && this.#scene !== undefined)
      if (current.el.currentTime >= current.track.end - FADE.track)
        this.#handOver(this.#scene, FADE.track, now);
    for (const d of [...this.#decks]) {
      const u = d.fade === undefined ? 1 : (now - d.fade.at) / d.fade.seconds;
      const gain =
        d.fade === undefined ? 1 : d.fade.dir === 'in' ? crossfade(u).into : crossfade(u).out;
      d.el.volume = trackVolume(d.track, gain);
      if (d.fade !== undefined && u >= 1) {
        if (d.fade.dir === 'out') {
          // (let go of the file: an empty src would be the page's own address, fetched as audio)
          d.el.pause();
          d.el.removeAttribute('src');
          d.el.load();
          this.#decks = this.#decks.filter((x) => x !== d);
        } else d.fade = undefined;
      }
    }
  }

  /** The next track of `scene` comes in over `seconds`; whatever sounds now goes out over them. */
  #handOver(scene: MusicScene, seconds: number, now: number): void {
    const el = this.#make();
    if (el === undefined) return;
    for (const d of this.#decks)
      if (d.fade?.dir !== 'out') {
        // (one fading in already is taken out from where it got to, not from full)
        const from = d.fade === undefined ? 1 : crossfade((now - d.fade.at) / d.fade.seconds).into;
        d.fade = {
          dir: 'out',
          at: now - (1 - from) * Math.max(seconds, 0.01),
          seconds: Math.max(seconds, 0.01),
        };
      }
    const track = this.#playlist.next(scene);
    el.preload = 'auto';
    el.src = this.#base + track.file;
    el.volume = 0;
    const deck: Deck = {
      track,
      el,
      fade: seconds > 0 ? { dir: 'in', at: now, seconds } : undefined,
    };
    this.#decks.push(deck);
    this.#play(el);
  }

  #play(el: AudioLike): void {
    // (held back until a key or a tap: #unlock tries again then; an older browser returns nothing, or throws)
    try {
      const p = el.play();
      if (p !== undefined && typeof p.catch === 'function') p.catch(() => undefined);
    } catch {
      // (no music is better than no game)
    }
  }
}

const params = typeof location === 'undefined' ? undefined : new URLSearchParams(location.search);
export const musicPlayer = new MusicPlayer({
  make: () => (typeof Audio === 'undefined' ? undefined : new Audio()),
  now: () => performance.now() / 1000,
  base: import.meta.env.BASE_URL,
  enabled: params?.get('music') !== 'off',
});
