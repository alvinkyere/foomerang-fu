import { describe, expect, it } from 'vitest';
import { CHARACTER_COLOURS } from '../src/render/reconstructed/characterColours';
import { RECONSTRUCTED_MAPS, type PackCharacter } from '../src/render/reconstructed/maps';

// Each character has ONE colour (owner, 2026-10-19): its boomerang is that colour and so is its trail and aim line — a mostly
// yellow banana throws a yellow boomerang with a yellow trail. Taken from the character's own atlas (art/physics_reference: the
// largest colour cluster), except the donut, whose identity is its pink icing (the reference video's pink-trail donut).

const ALL: PackCharacter[] = [
  'avocado',
  'bacon',
  'banana',
  'bread',
  'carrot',
  'coffee',
  'donut',
  'icecream',
  'milk',
  'watermelon',
];

describe('character colours', () => {
  it('every character has one, as a #rrggbb colour', () => {
    for (const kind of ALL) expect(CHARACTER_COLOURS[kind], kind).toMatch(/^#[0-9a-f]{6}$/);
    expect(Object.keys(CHARACTER_COLOURS).sort()).toEqual([...ALL].sort());
  });

  it('every character any map seats has one', () => {
    for (const map of Object.values(RECONSTRUCTED_MAPS))
      for (const kind of map.roster)
        expect(CHARACTER_COLOURS[kind], `${map.id} ${kind}`).toBeDefined();
  });

  it('they are the characters’ own: a yellow banana, a red watermelon, a blue milk carton, a pink donut', () => {
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
        number,
        number,
        number,
      ];
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);
      if (d === 0) return 0;
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    expect(hue(CHARACTER_COLOURS.banana)).toBeGreaterThan(50);
    expect(hue(CHARACTER_COLOURS.banana)).toBeLessThan(65); // yellow
    expect(hue(CHARACTER_COLOURS.watermelon)).toBeLessThan(10); // red
    expect(hue(CHARACTER_COLOURS.milk)).toBeGreaterThan(195);
    expect(hue(CHARACTER_COLOURS.milk)).toBeLessThan(215); // blue
    expect(hue(CHARACTER_COLOURS.donut)).toBeGreaterThan(320); // pink
    expect(hue(CHARACTER_COLOURS.avocado)).toBeGreaterThan(110);
    expect(hue(CHARACTER_COLOURS.avocado)).toBeLessThan(140); // green
  });
});
