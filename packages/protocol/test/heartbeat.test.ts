import { describe, expect, it } from 'vitest';
import { heartbeatAckMessageSchema, heartbeatMessageSchema } from '../src/heartbeat';

describe.each([
  ['HEARTBEAT', heartbeatMessageSchema],
  ['HEARTBEAT_ACK', heartbeatAckMessageSchema],
] as const)('%s (session-layer liveness)', (type, schema) => {
  it('has its own minimal shape { type, seq } — no payload', () => {
    const result = schema.safeParse({ type, seq: 12 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ type, seq: 12 });
  });

  it.each([
    ['payload present', (t: string) => ({ type: t, seq: 1, payload: {} })],
    ['missing seq', (t: string) => ({ type: t })],
    ['negative seq', (t: string) => ({ type: t, seq: -1 })],
    ['fractional seq', (t: string) => ({ type: t, seq: 0.5 })],
    ['NaN seq', (t: string) => ({ type: t, seq: Number.NaN })],
    ['Infinity seq', (t: string) => ({ type: t, seq: Number.POSITIVE_INFINITY })],
    ['string seq', (t: string) => ({ type: t, seq: '1' })],
    ['extra field', (t: string) => ({ type: t, seq: 1, t: 1234 })],
    ['wrong type', () => ({ type: 'PING', seq: 1 })],
  ])('rejects %s', (_label, build) => {
    expect(schema.safeParse(build(type)).success).toBe(false);
  });

  it('echoes any valid seq, including 0 and the maximum', () => {
    expect(schema.safeParse({ type, seq: 0 }).success).toBe(true);
    expect(schema.safeParse({ type, seq: 4_294_967_295 }).success).toBe(true);
  });
});
