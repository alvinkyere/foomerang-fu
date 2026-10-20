import { describe, expect, it } from 'vitest';
import { scoreboardColours } from '../src/characters/videoPalette';

// The scoreboard between rounds ("ff scoreboard.jpg", owner 2026-10-19): each player's band is a mid-tone of their
// character, filled dots a light tint, empty dots a dark shade. Six characters are measured from the image (medians over
// each band and its first and last dot); the others follow the rule those six obey, from the character's video badge.

describe('scoreboard colours', () => {
  it('are the image’s own for the six characters it shows', () => {
    expect(scoreboardColours('coffee')).toEqual({
      band: '#9b9b92',
      filled: '#fbfffe',
      empty: '#6b6c64',
    });
    expect(scoreboardColours('icecream')).toEqual({
      band: '#4e9179',
      filled: '#6bebbd',
      empty: '#266d4f',
    });
    expect(scoreboardColours('carrot').band).toBe('#9b6948');
    expect(scoreboardColours('banana').filled).toBe('#e9d767');
    expect(scoreboardColours('bread').empty).toBe('#806a39');
    expect(scoreboardColours('bacon').band).toBe('#815f54');
  });

  it('follow the image’s rule for the rest: the badge’s hue, a mid-tone band, a lighter fill, a darker empty', () => {
    const lum = (hex: string) => {
      const n = Number.parseInt(hex.slice(1), 16);
      return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    };
    for (const id of ['avocado', 'milk', 'watermelon', 'donut'] as const) {
      const c = scoreboardColours(id);
      expect(lum(c.filled)).toBeGreaterThan(lum(c.band));
      expect(lum(c.band)).toBeGreaterThan(lum(c.empty));
    }
    expect(scoreboardColours('milk')).toEqual({
      band: '#4c74a0',
      filled: '#80b5ee',
      empty: '#2a517b',
    });
  });
});
