import { isPlayable, type SelectCharacter } from '../runtime/characterSelect';
import type { CharacterView } from '../shell/model';

const NAMES: Readonly<Record<SelectCharacter, string>> = {
  avocado: 'Avocado',
  bacon: 'Bacon',
  banana: 'Banana',
  bread: 'Bread',
  eggplant: 'Eggplant',
  sushi: 'Sushi',
  carrot: 'Carrot',
  coffee: 'Coffee',
  donut: 'Donut',
  icecream: 'Ice Cream',
  milk: 'Milk',
  watermelon: 'Watermelon',
};

/**
 * Character select's palette is the reference video's (owner, 2026-10-19), measured from game-setting.mp4: each badge is
 * the median of a ring round its "P1" text over 2–3 frames; a READY fill is the video's own where the video readies that
 * character, else the video's rule for them (the badge's hue, saturation 0.25, value 0.99: within a few levels of every
 * fill it shows). This is the menus' palette only: a boomerang and its trail stay the character's colour
 * (render/reconstructed/characterColours.ts).
 */
const BADGE: Readonly<Record<SelectCharacter, string>> = {
  avocado: '#93d15a',
  bacon: '#d18667',
  banana: '#e1c83e',
  bread: '#b08f4c',
  carrot: '#de8b56',
  coffee: '#aeb5b1',
  donut: '#e8768f',
  eggplant: '#8771de',
  sushi: '#707773',
  icecream: '#50c9ba',
  milk: '#5597de',
  watermelon: '#e74548',
};
const MEASURED_FILL: Partial<Record<SelectCharacter, string>> = {
  banana: '#fcf2b9',
  coffee: '#fbf9f3',
  donut: '#ffc4d3',
  eggplant: '#cdc1fd',
  watermelon: '#ffc2c4',
};

/** Hex ↔ HSV (h in [0, 6), s and v in [0, 1]). */
const toHsv = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h =
    d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h, max === 0 ? 0 : d / max, max];
};
const fromHsv = (h: number, s: number, v: number): string => {
  const k = (m: number): number => (m + h) % 6;
  const ch = (m: number): number => v - v * s * Math.max(0, Math.min(k(m), 4 - k(m), 1));
  return `#${[ch(5), ch(3), ch(1)]
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
};

/** The video's READY-fill rule: the badge's hue, saturation at most 0.25 (a near-white keeps its own), value 0.99. */
const fillOf = (hex: string): string => {
  const [h, s] = toHsv(hex);
  return fromHsv(h, Math.min(0.25, s / 2), 0.99);
};

export interface ScoreboardColours {
  /** The player's band. */
  readonly band: string;
  /** A kill: a filled dot. */
  readonly filled: string;
  /** A kill still to make: an empty dot. */
  readonly empty: string;
}

/**
 * The scoreboard between rounds ("ff scoreboard.jpg"): measured for the six characters that image shows (medians over each
 * band and its first and last dot), and for the rest the rule those six follow from the character's video badge: band =
 * the badge's hue, saturation ×0.85, value ×0.72; filled = saturation ×0.75, value ×1.07; empty = the band's hue, saturation
 * ×1.25, value ×0.77 of the band.
 */
const MEASURED_SCOREBOARD: Partial<Record<SelectCharacter, ScoreboardColours>> = {
  bacon: { band: '#815f54', filled: '#e7947a', empty: '#5c382a' },
  banana: { band: '#a6973c', filled: '#e9d767', empty: '#807114' },
  bread: { band: '#a6905f', filled: '#e9d3a2', empty: '#806a39' },
  carrot: { band: '#9b6948', filled: '#efaa89', empty: '#764423' },
  coffee: { band: '#9b9b92', filled: '#fbfffe', empty: '#6b6c64' },
  icecream: { band: '#4e9179', filled: '#6bebbd', empty: '#266d4f' },
};

export const scoreboardColours = (id: SelectCharacter): ScoreboardColours => {
  const measured = MEASURED_SCOREBOARD[id];
  if (measured !== undefined) return measured;
  const [h, s, v] = toHsv(BADGE[id]);
  const bandS = s * 0.85;
  const bandV = v * 0.72;
  return {
    band: fromHsv(h, bandS, bandV),
    filled: fromHsv(h, s * 0.75, Math.min(1, v * 1.07)),
    empty: fromHsv(h, Math.min(1, bandS * 1.25), bandV * 0.77),
  };
};

/** A character's name, as the menus write it. */
export const characterName = (id: SelectCharacter): string => NAMES[id];

/**
 * The end-of-match results ("foomerang fu results.jpg"): each column's colour (its award pills and placing ribbon; the
 * portrait's circle is the same, translucent). Measured for the five characters the image shows (medians over each pill);
 * the rest by the rule those follow from the video badge: the badge's hue, saturation ×0.92, value 0.98.
 */
const MEASURED_RESULTS: Partial<Record<SelectCharacter, string>> = {
  bread: '#f6c76a',
  donut: '#f684af',
  milk: '#77bafc',
  sushi: '#d5f5ea',
  watermelon: '#e63954',
};
export const resultsColour = (id: SelectCharacter): string => {
  const measured = MEASURED_RESULTS[id];
  if (measured !== undefined) return measured;
  const [h, s] = toHsv(BADGE[id]);
  return fromHsv(h, Math.min(1, s * 0.92), 0.98);
};

/** The winner's panel on the results: their results colour darkened as the image darkens the watermelon's. */
export const resultsPanel = (id: SelectCharacter): string => {
  if (id === 'watermelon') return '#a0263b'; // measured
  const [h, s, v] = toHsv(resultsColour(id));
  return fromHsv(h, Math.min(1, s * 1.05), v * 0.63);
};

export const characterView = (id: SelectCharacter): CharacterView => ({
  id,
  name: NAMES[id],
  color: BADGE[id],
  tint: MEASURED_FILL[id] ?? fillOf(BADGE[id]),
  portrait: isPlayable(id) ? `characters/${id}.webp` : '',
  ...(isPlayable(id) ? {} : { comingSoon: true as const }),
});
