import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_TIMINGS, elapsedSince, resolveTimings } from '../src/timing';

describe('room timings (initial product hypotheses, not constants)', () => {
  it('default to a 10 s reconnecting window and a 60 s seat reservation', () => {
    expect(DEFAULT_ROOM_TIMINGS).toEqual({
      reconnectingWindowMs: 10_000,
      seatReservationMs: 60_000,
    });
    expect(Object.isFrozen(DEFAULT_ROOM_TIMINGS)).toBe(true);
  });

  it('resolve to the defaults when nothing is configured', () => {
    expect(resolveTimings()).toEqual(DEFAULT_ROOM_TIMINGS);
    expect(resolveTimings({})).toEqual(DEFAULT_ROOM_TIMINGS);
  });

  it('allow either duration to be overridden', () => {
    expect(resolveTimings({ reconnectingWindowMs: 2_000 })).toEqual({
      reconnectingWindowMs: 2_000,
      seatReservationMs: 60_000,
    });
    expect(resolveTimings({ seatReservationMs: 120_000 })).toEqual({
      reconnectingWindowMs: 10_000,
      seatReservationMs: 120_000,
    });
  });

  it('accept equal durations (the seat is released the moment the window ends)', () => {
    expect(() =>
      resolveTimings({ reconnectingWindowMs: 5_000, seatReservationMs: 5_000 }),
    ).not.toThrow();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2])(
    'reject a reconnecting window of %s (programming error)',
    (reconnectingWindowMs) => {
      expect(() => resolveTimings({ reconnectingWindowMs })).toThrow();
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'reject a seat reservation of %s (programming error)',
    (seatReservationMs) => {
      expect(() => resolveTimings({ seatReservationMs })).toThrow();
    },
  );

  it('reject a seat reservation shorter than the reconnecting window', () => {
    // The seat would be given away while the player is still "reconnecting".
    expect(() =>
      resolveTimings({ reconnectingWindowMs: 10_000, seatReservationMs: 9_999 }),
    ).toThrow();
  });
});

describe('elapsedSince (monotonic-clock contract)', () => {
  it('is the non-negative difference between two readings of the same clock', () => {
    expect(elapsedSince(100, 150)).toBe(50);
    expect(elapsedSince(100, 100)).toBe(0);
  });

  it('treats a clock that went backwards as a violated contract: it throws, it does not return nonsense', () => {
    expect(() => elapsedSince(100, 99)).toThrow(/backwards/i);
  });
});
