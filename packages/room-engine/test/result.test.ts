import { describe, expect, it } from 'vitest';
import { fail, ok, type Result } from '../src/result';

describe('Result', () => {
  it('ok carries a value', () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it('fail carries a reason and no value', () => {
    const failure = fail('ROOM_FULL');
    expect(failure).toEqual({ ok: false, reason: 'ROOM_FULL' });
    expect('value' in failure).toBe(false);
  });

  it('narrows on `ok`', () => {
    const attempt = (succeed: boolean): Result<number, 'NOPE'> => (succeed ? ok(1) : fail('NOPE'));
    const good = attempt(true);
    const bad = attempt(false);
    expect(good.ok && good.value).toBe(1);
    expect(!bad.ok && bad.reason).toBe('NOPE');
  });
});
