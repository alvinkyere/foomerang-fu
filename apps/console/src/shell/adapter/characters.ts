import { isPlayable, type SelectCharacter } from '../../runtime/characterSelect';
import type { CharacterView } from '../model';

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

/** The video's READY-fill rule: the badge's hue, saturation at most 0.25 (a near-white keeps its own), value 0.99. */
const fillOf = (hex: string): string => {
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
  const s = Math.min(0.25, (max === 0 ? 0 : d / max) / 2);
  const v = 0.99;
  const k = (m: number): number => (m + h) % 6;
  const ch = (m: number): number => v - v * s * Math.max(0, Math.min(k(m), 4 - k(m), 1));
  return `#${[ch(5), ch(3), ch(1)]
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
};

export const characterView = (id: SelectCharacter): CharacterView => ({
  id,
  name: NAMES[id],
  color: BADGE[id],
  tint: MEASURED_FILL[id] ?? fillOf(BADGE[id]),
  portrait: isPlayable(id) ? `characters/${id}.webp` : '',
  ...(isPlayable(id) ? {} : { comingSoon: true as const }),
});
