import { describe, expect, it } from 'vitest';
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, joinCodeSchema } from '../src/room';

const parse = (value: unknown) => joinCodeSchema.safeParse(value);

describe('join code representation', () => {
  it('is six characters', () => {
    expect(JOIN_CODE_LENGTH).toBe(6);
  });

  it('uses an unambiguous alphabet: uppercase letters and digits, no 0 O 1 I L', () => {
    const chars = [...JOIN_CODE_ALPHABET];
    expect(new Set(chars).size).toBe(chars.length); // unique
    expect(chars.length).toBe(31);
    for (const banned of ['0', 'O', '1', 'I', 'L']) {
      expect(chars).not.toContain(banned);
    }
    expect(JOIN_CODE_ALPHABET).toMatch(/^[A-Z2-9]+$/);
  });

  it('accepts a valid code', () => {
    const result = parse('K7M4PX');
    expect(result.success).toBe(true);
    expect(result.data).toBe('K7M4PX');
  });

  it('is case-insensitive and normalizes to uppercase', () => {
    expect(parse('k7m4px').data).toBe('K7M4PX');
    expect(parse('k7M4pX').data).toBe('K7M4PX');
  });

  it('accepts every alphabet character in every position', () => {
    const chars = [...JOIN_CODE_ALPHABET];
    for (let i = 0; i < chars.length; i += 1) {
      const code = Array.from({ length: 6 }, (_, k) => chars[(i + k) % chars.length]).join('');
      expect(parse(code).success, code).toBe(true);
    }
  });

  it.each([
    ['empty', ''],
    ['too short', 'K7M4P'],
    ['too long', 'K7M4PXA'],
    ['banned 0', 'K7M4P0'],
    ['banned O', 'K7M4PO'],
    ['banned 1', 'K7M4P1'],
    ['banned I', 'K7M4PI'],
    ['banned L', 'K7M4PL'],
    ['banned lowercase o', 'K7M4Po'],
    ['leading space', ' K7M4P'],
    ['trailing space', 'K7M4P '],
    ['trailing newline', 'K7M4PX\n'],
    ['punctuation', 'K7-4PX'],
    ['cyrillic lookalikes', 'К7М4РХ'],
    ['long s lookalike (uppercases to S)', 'ſ7M4PX'],
    ['sharp s (uppercases to SS, would change length)', 'ß7M4P'],
    ['emoji', 'K7M4P😀'],
    ['full-width letters', 'ＫＭＡＢＣＤ'],
  ])('rejects %s', (_label, value) => {
    expect(parse(value).success).toBe(false);
  });

  it.each([123456, null, undefined, {}, [], ['K7M4PX'], true])('rejects non-string %j', (value) => {
    expect(parse(value).success).toBe(false);
  });
});
