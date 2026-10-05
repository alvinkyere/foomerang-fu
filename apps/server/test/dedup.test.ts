import { describe, expect, it } from 'vitest';
import { BoundedEventWindow } from '../src/dedup';

describe('BoundedEventWindow (bounded action-event deduplication)', () => {
  it('accepts a new event once and recognizes a retry', () => {
    const window = new BoundedEventWindow(8);
    expect(window.record('press-000001')).toBe('NEW');
    expect(window.record('press-000001')).toBe('DUPLICATE');
    expect(window.record('press-000001')).toBe('DUPLICATE');
    expect(window.record('press-000002')).toBe('NEW');
  });

  it('its memory is bounded: it never holds more than its capacity, however many events pass', () => {
    const window = new BoundedEventWindow(64);
    for (let i = 0; i < 100_000; i += 1) window.record(`event-${i.toString().padStart(8, '0')}`);
    expect(window.size).toBe(64);
  });

  it('forgets the OLDEST events first (a documented limit, not a bug)', () => {
    const window = new BoundedEventWindow(3);
    for (const id of ['event-aaaa1', 'event-bbbb2', 'event-cccc3']) window.record(id);
    window.record('event-dddd4'); // evicts event-aaaa1
    expect(window.record('event-bbbb2')).toBe('DUPLICATE');
    expect(window.record('event-aaaa1')).toBe('NEW'); // forgotten: outside the window
  });

  it('a recent retry is always caught, however much newer traffic has followed within the window', () => {
    const window = new BoundedEventWindow(256);
    window.record('press-000001');
    for (let i = 0; i < 200; i += 1) window.record(`other-${i.toString().padStart(6, '0')}`);
    expect(window.record('press-000001')).toBe('DUPLICATE');
  });

  it('is safe with ids that are special property names', () => {
    const window = new BoundedEventWindow(8);
    expect(window.record('__proto__')).toBe('NEW');
    expect(window.record('__proto__')).toBe('DUPLICATE');
    expect(window.record('constructor')).toBe('NEW');
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses capacity %s (programming error)',
    (capacity) => {
      expect(() => new BoundedEventWindow(capacity)).toThrow(RangeError);
    },
  );
});
