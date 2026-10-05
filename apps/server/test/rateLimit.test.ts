import { describe, expect, it } from 'vitest';
import { DEFAULT_RATE_LIMITS, TokenBucket, classifyMessage } from '../src/rateLimit';

describe('TokenBucket (time is injected)', () => {
  it('allows a burst, then refuses', () => {
    const bucket = new TokenBucket({ burst: 5, refillPerSecond: 1 });
    const results = Array.from({ length: 8 }, () => bucket.tryTake(0));
    expect(results).toEqual([true, true, true, true, true, false, false, false]);
  });

  it('refills in proportion to elapsed time', () => {
    const bucket = new TokenBucket({ burst: 5, refillPerSecond: 2 });
    for (let i = 0; i < 5; i += 1) bucket.tryTake(0);
    expect(bucket.tryTake(0)).toBe(false);
    expect(bucket.tryTake(499)).toBe(false); // 0.998 tokens: not yet
    expect(bucket.tryTake(500)).toBe(true); // 1 token
    expect(bucket.tryTake(500)).toBe(false);
    expect(bucket.tryTake(1_500)).toBe(true); // +2 tokens
    expect(bucket.tryTake(1_500)).toBe(true);
    expect(bucket.tryTake(1_500)).toBe(false);
  });

  it('never accumulates more than the burst, however long it idles', () => {
    const bucket = new TokenBucket({ burst: 3, refillPerSecond: 100 });
    const accepted = Array.from({ length: 10 }, () => bucket.tryTake(3_600_000)).filter(Boolean);
    expect(accepted).toHaveLength(3);
  });

  it('a clock that stands still never refills; a clock that goes backwards neither refills nor throws', () => {
    const bucket = new TokenBucket({ burst: 1, refillPerSecond: 1_000 });
    expect(bucket.tryTake(1_000)).toBe(true);
    expect(bucket.tryTake(1_000)).toBe(false);
    expect(bucket.tryTake(500)).toBe(false);
    expect(bucket.tryTake(1_001)).toBe(true); // moving forward again from the high-water mark
  });
});

describe('default limits protect the process without hurting a legitimate controller', () => {
  const take = (name: keyof typeof DEFAULT_RATE_LIMITS, ratePerSecond: number, seconds: number) => {
    const config = DEFAULT_RATE_LIMITS[name] as { burst: number; refillPerSecond: number };
    const bucket = new TokenBucket(config);
    let dropped = 0;
    for (let i = 0; i < ratePerSecond * seconds; i += 1) {
      if (!bucket.tryTake((i * 1000) / ratePerSecond)) dropped += 1;
    }
    return dropped;
  };

  it('60 Hz movement for a minute: nothing dropped', () => {
    expect(take('movement', 60, 60)).toBe(0);
  });

  it('even 100 Hz movement (sloppy client) is fine', () => {
    expect(take('movement', 100, 60)).toBe(0);
  });

  it('a 4-second pile-up released at once (Wi-Fi hiccup) is absorbed by the burst', () => {
    const bucket = new TokenBucket(DEFAULT_RATE_LIMITS.movement);
    const accepted = Array.from({ length: 240 }, () => bucket.tryTake(0)).filter(Boolean);
    expect(accepted).toHaveLength(240);
  });

  it('a runaway client sending 100,000 movement messages in an instant gets at most the burst', () => {
    const bucket = new TokenBucket(DEFAULT_RATE_LIMITS.movement);
    let accepted = 0;
    for (let i = 0; i < 100_000; i += 1) if (bucket.tryTake(0)) accepted += 1;
    expect(accepted).toBe(DEFAULT_RATE_LIMITS.movement.burst);
  });

  it('room operations are tightly limited (no join spam)', () => {
    const bucket = new TokenBucket(DEFAULT_RATE_LIMITS.room);
    let accepted = 0;
    for (let i = 0; i < 1_000; i += 1) if (bucket.tryTake(0)) accepted += 1;
    expect(accepted).toBeLessThanOrEqual(10);
  });

  it('a handful of handshakes is plenty; floods are not', () => {
    const bucket = new TokenBucket(DEFAULT_RATE_LIMITS.handshake);
    let accepted = 0;
    for (let i = 0; i < 100; i += 1) if (bucket.tryTake(0)) accepted += 1;
    expect(accepted).toBeLessThanOrEqual(5);
  });

  it('has bounded tolerance for dropped and invalid messages before a connection is cut', () => {
    expect(DEFAULT_RATE_LIMITS.maxDroppedMessages).toBeGreaterThan(0);
    expect(DEFAULT_RATE_LIMITS.maxInvalidMessages).toBeGreaterThan(0);
    expect(Number.isFinite(DEFAULT_RATE_LIMITS.maxDroppedMessages)).toBe(true);
  });
});

describe('classifyMessage (decided BEFORE parsing, from untrusted data, without throwing)', () => {
  it.each([
    ['HANDSHAKE', 'handshake'],
    ['ROOM_CREATE', 'room'],
    ['ROOM_JOIN', 'room'],
    ['PLAYER_RECONNECT', 'room'],
    ['HOST_RECONNECT', 'room'],
    ['INPUT_MOVE', 'movement'],
    ['INPUT_EVENT', 'action'],
    ['HEARTBEAT', 'heartbeat'],
    ['TELEPORT', 'other'],
  ])('%s → %s', (type, expected) => {
    expect(classifyMessage({ type })).toBe(expected);
  });

  it.each([null, undefined, 42, 'INPUT_MOVE', [], {}, { type: 7 }, { type: null }])(
    'garbage %j → other',
    (value) => {
      expect(classifyMessage(value)).toBe('other');
    },
  );

  it('survives a hostile object whose type getter throws', () => {
    const hostile = {
      get type(): string {
        throw new Error('boom');
      },
    };
    expect(classifyMessage(hostile)).toBe('other');
  });
});
