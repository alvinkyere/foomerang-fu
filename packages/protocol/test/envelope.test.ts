import { describe, expect, it } from 'vitest';
import { SEQ_MAX, eventIdSchema, seqSchema } from '../src/envelope';

describe('seq', () => {
  it('is an unsigned 32-bit integer', () => {
    expect(SEQ_MAX).toBe(4_294_967_295);
  });

  it.each([0, 1, 1842, 65_535, SEQ_MAX])('accepts %s', (value) => {
    expect(seqSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    -1,
    1.5,
    0.1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    SEQ_MAX + 1,
    2 ** 53,
    Number.MAX_SAFE_INTEGER + 2,
    '5',
    null,
    undefined,
    {},
    [],
    true,
    10n,
  ])('rejects %s', (value) => {
    expect(seqSchema.safeParse(value).success).toBe(false);
  });
});

describe('eventId', () => {
  // Client-generated, unique per event within a session. Deliberately NOT required to be a UUID:
  // crypto.randomUUID() is unavailable in insecure contexts (e.g. a phone loading the controller
  // over plain HTTP on a LAN during development).
  it.each(['a1b2c3d4', 'AbC_-123456789', 'x'.repeat(64), 'sess7-000042'])('accepts %s', (value) => {
    expect(eventIdSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['too short', 'abc1234'],
    ['too long', 'x'.repeat(65)],
    ['space', 'abcd efgh'],
    ['path traversal', '../../etc/passwd'],
    ['markup', '<script>alert(1)</script>'],
    ['newline', 'abcdefgh\n'],
    ['unicode', 'abcdéfgh'],
    ['emoji', 'abcdefg😀'],
    ['number', 12345678],
    ['null', null],
    ['undefined', undefined],
    ['object', {}],
  ])('rejects %s', (_label, value) => {
    expect(eventIdSchema.safeParse(value).success).toBe(false);
  });
});
