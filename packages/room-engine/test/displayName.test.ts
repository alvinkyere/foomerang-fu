import { describe, expect, it } from 'vitest';
import { validateDisplayName } from '../src/displayName';

describe('display name (structural limits only — no moderation policy yet)', () => {
  it.each(['Alvin', 'A', 'Mary Jane', 'a'.repeat(16), 'José', '日本語', '😀', '😀'.repeat(16)])(
    'accepts %j',
    (name) => {
      expect(validateDisplayName(name)).toBe(name);
    },
  );

  it('trims surrounding whitespace', () => {
    expect(validateDisplayName('  Alvin  ')).toBe('Alvin');
    expect(validateDisplayName('Alvin\n')).toBe('Alvin');
  });

  it('counts Unicode code points, not UTF-16 units (one emoji is one character)', () => {
    expect(validateDisplayName('😀'.repeat(16))).toBeDefined();
    expect(validateDisplayName('😀'.repeat(17))).toBeUndefined();
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   \t '],
    ['17 characters', 'a'.repeat(17)],
    ['embedded NUL', 'Al\u0000vin'],
    ['embedded newline', 'Al\nvin'],
    ['tab inside', 'Al\tvin'],
    ['bidi override (spoofs text on the shared screen)', '‮evil'],
    ['zero-width space', 'Al​vin'],
    ['line separator', 'Al vin'],
    ['paragraph separator', 'Al vin'],
    ['2 MB of text', 'A'.repeat(2_000_000)],
  ])('rejects %s', (_label, name) => {
    expect(validateDisplayName(name)).toBeUndefined();
  });

  it('allows duplicate names (disambiguation is a UX concern, not a domain rule)', () => {
    expect(validateDisplayName('Alvin')).toBe(validateDisplayName('Alvin'));
  });
});
