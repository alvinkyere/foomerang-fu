import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  ACTION_PHASES,
  axisSchema,
  inputEventMessageSchema,
  inputMoveMessageSchema,
} from '../src/controller';

const move = (x: unknown, y: unknown, seq: unknown = 1) => ({
  type: 'INPUT_MOVE',
  seq,
  payload: { x, y },
});

const parseMove = (value: unknown) => inputMoveMessageSchema.safeParse(value);

describe('joystick axis semantics', () => {
  // Normalized, screen-independent: center (0,0), full right (1,0), full left (-1,0).
  // Never pixels. Dead zone / speed / acceleration are the GAME's decisions.
  it.each([-1, -0.5, -0, 0, 0.25, 0.9999, 1])('accepts %s', (value) => {
    expect(axisSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    1.0000001,
    -1.0000001,
    2,
    -2,
    394, // pixels, not normalized
    Number.MAX_VALUE,
    '0.5',
    null,
    undefined,
    {},
    true,
    0n,
  ])('rejects %s', (value) => {
    expect(axisSchema.safeParse(value).success).toBe(false);
  });
});

describe('INPUT_MOVE (state: latest-wins)', () => {
  it('accepts center, full right, full left, up and down', () => {
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      expect(parseMove(move(x, y)).success, `${x},${y}`).toBe(true);
    }
  });

  it('has the state-envelope shape { type, seq, payload }', () => {
    const result = parseMove(move(0.91, 0.12, 401));
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ type: 'INPUT_MOVE', seq: 401, payload: { x: 0.91, y: 0.12 } });
  });

  it('accepts corner values; consumers must clamp magnitude to the unit disc', () => {
    // Range validation only: (1,1) has magnitude √2 and is NOT rejected here, because legitimate
    // floating-point output (cos/sin) can exceed 1 by an epsilon. The simulation clamps magnitude.
    expect(parseMove(move(1, 1)).success).toBe(true);
  });

  it.each([
    ['x NaN', move(Number.NaN, 0)],
    ['y NaN', move(0, Number.NaN)],
    ['x Infinity', move(Number.POSITIVE_INFINITY, 0)],
    ['y -Infinity', move(0, Number.NEGATIVE_INFINITY)],
    ['x out of range', move(1.5, 0)],
    ['y out of range', move(0, -1.5)],
    ['x as string', move('0.5', 0)],
    ['y null', move(0, null)],
    ['missing y', { type: 'INPUT_MOVE', seq: 1, payload: { x: 0 } }],
    ['missing x', { type: 'INPUT_MOVE', seq: 1, payload: { y: 0 } }],
    ['empty payload', { type: 'INPUT_MOVE', seq: 1, payload: {} }],
    ['missing payload', { type: 'INPUT_MOVE', seq: 1 }],
    ['array payload', { type: 'INPUT_MOVE', seq: 1, payload: [0, 0] }],
    ['missing seq', { type: 'INPUT_MOVE', payload: { x: 0, y: 0 } }],
    ['seq negative', move(0, 0, -1)],
    ['seq fractional', move(0, 0, 1.5)],
    ['seq NaN', move(0, 0, Number.NaN)],
    ['seq Infinity', move(0, 0, Number.POSITIVE_INFINITY)],
    ['seq too large', move(0, 0, 2 ** 32)],
    ['seq string', move(0, 0, '1')],
    ['extra top-level field', { ...move(0, 0), eventId: 'abcdefgh' }],
    ['extra payload field', { type: 'INPUT_MOVE', seq: 1, payload: { x: 0, y: 0, speed: 99 } }],
    ['wrong type casing', { ...move(0, 0), type: 'input_move' }],
  ])('rejects %s', (_label, value) => {
    expect(parseMove(value).success).toBe(false);
  });

  it('rejects a __proto__ key arriving from JSON', () => {
    const hostile = JSON.parse(
      '{"type":"INPUT_MOVE","seq":1,"payload":{"x":0,"y":0},"__proto__":{"admin":true}}',
    ) as unknown;
    expect(parseMove(hostile).success).toBe(false);
  });
});

const action = (overrides: Record<string, unknown> = {}) => ({
  type: 'INPUT_EVENT',
  seq: 7,
  eventId: 'press-000042',
  payload: { action: 'PRIMARY', phase: 'pressed' },
  ...overrides,
});

const without = (key: string) => {
  return Object.fromEntries(Object.entries(action()).filter(([k]) => k !== key));
};

const parseEvent = (value: unknown) => inputEventMessageSchema.safeParse(value);

describe('INPUT_EVENT (event: reliable, deduplicated by eventId)', () => {
  it('defines the generic actions and phases', () => {
    expect([...ACTIONS]).toEqual(['PRIMARY', 'SECONDARY', 'TERTIARY']);
    expect([...ACTION_PHASES]).toEqual(['pressed', 'released']);
  });

  it('has the event-envelope shape { type, seq, eventId, payload }', () => {
    const result = parseEvent(action());
    expect(result.success).toBe(true);
    expect(result.data).toEqual(action());
  });

  it.each(ACTIONS.flatMap((a) => ACTION_PHASES.map((p) => [a, p] as const)))(
    'accepts %s %s',
    (a, p) => {
      expect(parseEvent(action({ payload: { action: a, phase: p } })).success).toBe(true);
    },
  );

  it("treats a repeated eventId as schema-valid: deduplication is the receiver's job, not the schema's", () => {
    expect(parseEvent(action()).success).toBe(true);
    expect(parseEvent(action()).success).toBe(true);
  });

  it.each([
    ['missing eventId', without('eventId')],
    ['eventId too short', action({ eventId: 'abc' })],
    ['eventId with spaces', action({ eventId: 'press 000042' })],
    ['eventId markup', action({ eventId: '<script>alert(1)</script>' })],
    ['eventId number', action({ eventId: 12345678 })],
    ['missing seq', without('seq')],
    ['seq invalid', action({ seq: -3 })],
    ['unknown action', action({ payload: { action: 'QUATERNARY', phase: 'pressed' } })],
    ['lowercase action', action({ payload: { action: 'primary', phase: 'pressed' } })],
    ['unknown phase', action({ payload: { action: 'PRIMARY', phase: 'held' } })],
    ['uppercase phase', action({ payload: { action: 'PRIMARY', phase: 'PRESSED' } })],
    ['missing phase', action({ payload: { action: 'PRIMARY' } })],
    ['boolean instead of phase', action({ payload: { action: 'PRIMARY', pressed: true } })],
    ['extra payload field', action({ payload: { action: 'PRIMARY', phase: 'pressed', power: 9 } })],
    ['extra top-level field', action({ t: 123 })],
    ['payload null', action({ payload: null })],
  ])('rejects %s', (_label, value) => {
    expect(parseEvent(value).success).toBe(false);
  });
});
