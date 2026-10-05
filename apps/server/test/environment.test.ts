import { JOIN_CODE_ALPHABET, joinCodeSchema } from '@foomerang/protocol';
import { describe, expect, it } from 'vitest';
import { createNodeEnvironment } from '../src/environment';

const SAMPLE = 100_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// We test STRUCTURE (format, length, uniqueness, redaction) — not whether output "looks random".
// The security argument is that the platform CSPRNG is used correctly, not a home-made statistic.
describe('createNodeEnvironment — credentials', () => {
  const env = createNodeEnvironment();

  it('reconnect tokens are 256 bits of base64url (well above the 128-bit minimum)', () => {
    for (let i = 0; i < 1_000; i += 1) {
      const token = env.newReconnectToken().reveal();
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    }
  });

  it('host tokens have the same strength and format', () => {
    for (let i = 0; i < 1_000; i += 1) {
      const token = env.newHostToken().reveal();
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, 'base64url').length * 8).toBeGreaterThanOrEqual(128);
    }
  });

  it(`${SAMPLE} reconnect and host tokens together contain no duplicate`, () => {
    const seen = new Set<string>();
    for (let i = 0; i < SAMPLE; i += 1) {
      seen.add(env.newReconnectToken().reveal());
      seen.add(env.newHostToken().reveal());
    }
    expect(seen.size).toBe(SAMPLE * 2);
  });

  it('credentials redact themselves in every implicit representation', () => {
    const token = env.newReconnectToken();
    const secret = token.reveal();
    expect(String(token)).not.toContain(secret);
    expect(JSON.stringify({ token })).not.toContain(secret);
    expect(`${token}`).not.toContain(secret);
  });
});

describe('createNodeEnvironment — identifiers', () => {
  const env = createNodeEnvironment();

  it('room, player and host ids are UUID v4 strings', () => {
    expect(env.newRoomId()).toMatch(UUID);
    expect(env.newPlayerId()).toMatch(UUID);
    expect(env.newHostId()).toMatch(UUID);
  });

  it(`${SAMPLE} ids contain no duplicate`, () => {
    const seen = new Set<string>();
    for (let i = 0; i < SAMPLE; i += 1) seen.add(env.newPlayerId());
    expect(seen.size).toBe(SAMPLE);
  });

  it('join-code candidates are always valid codes drawn only from the unambiguous alphabet', () => {
    for (let i = 0; i < 10_000; i += 1) {
      const candidate = env.nextJoinCodeCandidate();
      expect(candidate).toHaveLength(6);
      for (const char of candidate) expect(JOIN_CODE_ALPHABET).toContain(char);
      expect(joinCodeSchema.safeParse(candidate).success).toBe(true);
    }
  });

  it('join codes are only candidates: the room engine decides availability (two calls differ in practice)', () => {
    const codes = new Set(Array.from({ length: 200 }, () => env.nextJoinCodeCandidate()));
    expect(codes.size).toBeGreaterThan(190);
  });
});

describe('createNodeEnvironment — monotonic time', () => {
  it('never goes backwards', () => {
    const env = createNodeEnvironment();
    let previous = env.now();
    for (let i = 0; i < 100_000; i += 1) {
      const current = env.now();
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it('measures elapsed time, not calendar time: it is not a wall-clock timestamp', () => {
    const env = createNodeEnvironment();
    expect(typeof env.now()).toBe('number');
    expect(Number.isFinite(env.now())).toBe(true);
    expect(env.now()).toBeLessThan(Date.now() / 10); // epoch milliseconds are ~1.7e12
  });

  it('advances with real time', async () => {
    const env = createNodeEnvironment();
    const before = env.now();
    await new Promise<void>((resolve) => setTimeout(resolve, 15));
    expect(env.now() - before).toBeGreaterThanOrEqual(10);
  });
});
