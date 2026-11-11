/**
 * The game's music: the owner's six tracks (2026-11-11, public/audio/music/), the theme and Ready Up in the menus, the four
 * others rotating in matches. Each track's `end` is where its music stops (trailing silence left out) and `gain` levels it to
 * the quietest (measured by art/audio/tracks.py: the loudness of its loud 80%, in 0.4 s blocks), so no track jumps out when
 * one hands over to the next. Pure: what plays next and how loud; musicPlayer.ts plays it.
 */
export type MusicScene = 'menu' | 'match';

export interface Track {
  readonly id: string;
  readonly title: string;
  /** Under the public folder. */
  readonly file: string;
  readonly scene: MusicScene;
  /** Seconds: where its music stops. */
  readonly end: number;
  /** Its leveling (1: the quietest, played as it is). */
  readonly gain: number;
}

// (measured: loudness -17.1, -15.2, -15.2, -12.7, -15.5, -15.4 dBFS; ends where the last 50 ms stays under -50 dBFS)
const db = (d: number): number => Math.round(10 ** (d / 20) * 1000) / 1000;
export const TRACKS: readonly Track[] = Object.freeze([
  {
    id: 'theme',
    title: 'Foomerang Fu Theme',
    file: 'audio/music/theme.mp3',
    scene: 'menu',
    end: 142.5,
    gain: 1,
  },
  {
    id: 'ready-up',
    title: 'Ready Up',
    file: 'audio/music/ready-up.mp3',
    scene: 'menu',
    end: 186.5,
    gain: db(-1.9),
  },
  {
    id: 'spilt-milk',
    title: 'Spilt Milk',
    file: 'audio/music/spilt-milk.mp3',
    scene: 'match',
    end: 241.7,
    gain: db(-1.9),
  },
  {
    id: 'sliced-bread',
    title: 'Sliced Bread',
    file: 'audio/music/sliced-bread.mp3',
    scene: 'match',
    end: 179.5,
    gain: db(-4.4),
  },
  {
    id: 'smashed-avo',
    title: 'Smashed Avo',
    file: 'audio/music/smashed-avo.mp3',
    scene: 'match',
    end: 210.0,
    gain: db(-1.6),
  },
  {
    id: 'banana-split',
    title: 'Banana Split',
    file: 'audio/music/banana-split.mp3',
    scene: 'match',
    end: 180.2,
    gain: db(-1.7),
  },
] as const);
export const MENU_TRACKS = TRACKS.filter((t) => t.scene === 'menu');
export const MATCH_TRACKS = TRACKS.filter((t) => t.scene === 'match');

/** Seconds a handover takes: when a track ends (it starts this long before its end), and when the screen changes. */
export const FADE = Object.freeze({ track: 4, scene: 1.5 });
/** The music's level under the effects (an element's volume at full). */
export const MUSIC_LEVEL = 0.7;

/** Equal-power crossfade at `u` (0..1) of the way through: the outgoing's and the incoming's gains. */
export function crossfade(u: number): { out: number; into: number } {
  const t = Math.min(1, Math.max(0, u));
  if (t === 0) return { out: 1, into: 0 };
  return { out: Math.cos((t * Math.PI) / 2), into: Math.sin((t * Math.PI) / 2) };
}

/** An element's volume for `track` at fade gain `fade`. */
export const trackVolume = (track: Track, fade: number): number =>
  Math.min(1, Math.max(0, MUSIC_LEVEL * track.gain * fade));

/**
 * What plays next. The menus: the theme first, then Ready Up, taking turns. Matches: a shuffle bag of their four (each
 * plays before any comes back; the first of a new bag is never the last of the one before). Randomness injected.
 */
export class Playlist {
  readonly #random: () => number;
  #menu = 0;
  #bag: Track[] = [];
  #last: Track | undefined;

  constructor(random: () => number = Math.random) {
    this.#random = random;
  }

  next(scene: MusicScene): Track {
    if (scene === 'menu') return MENU_TRACKS[this.#menu++ % MENU_TRACKS.length] as Track;
    if (this.#bag.length === 0) {
      const bag = [...MATCH_TRACKS];
      for (let i = bag.length - 1; i > 0; i -= 1) {
        const j = Math.min(i, Math.floor(this.#random() * (i + 1)));
        [bag[i], bag[j]] = [bag[j] as Track, bag[i] as Track];
      }
      if (bag[0] === this.#last && bag.length > 1)
        [bag[0], bag[1]] = [bag[1] as Track, bag[0] as Track];
      this.#bag = bag;
    }
    const t = this.#bag.shift() as Track;
    this.#last = t;
    return t;
  }
}
