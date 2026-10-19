import { CHARACTER_COLOURS } from '../../render/reconstructed/characterColours';
import type { PackCharacter } from '../../render/reconstructed/maps';
import type { CharacterView } from '../model';

const NAMES: Readonly<Record<PackCharacter, string>> = {
  avocado: 'Avocado',
  bacon: 'Bacon',
  banana: 'Banana',
  bread: 'Bread',
  carrot: 'Carrot',
  coffee: 'Coffee',
  donut: 'Donut',
  icecream: 'Ice Cream',
  milk: 'Milk',
  watermelon: 'Watermelon',
};

/**
 * The colours character select draws with, measured from game-setting.mp4: a badge or cursor is the character's own
 * colour, except where that colour is too pale to carry a white "P1": the mug (the video's badge is grey, #aeb5b1) and the
 * ice cream (the video's is teal, #4dccbe, where our mint is #7af7b9); a READY
 * circle or tile is that colour 68% of the way to white (watermelon #ec4247 → #ffc2c4 in the video).
 */
const BADGE: Partial<Record<PackCharacter, string>> = { coffee: '#aeb5b1', icecream: '#4dccbe' };
const TINT_TO_WHITE = 0.68;

const tint = (hex: string): string => {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (c: number): string =>
    Math.round(c + (255 - c) * TINT_TO_WHITE)
      .toString(16)
      .padStart(2, '0');
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
};

export const characterView = (id: PackCharacter): CharacterView => ({
  id,
  name: NAMES[id],
  color: BADGE[id] ?? CHARACTER_COLOURS[id],
  tint: tint(CHARACTER_COLOURS[id]),
  portrait: `characters/${id}.webp`,
});
