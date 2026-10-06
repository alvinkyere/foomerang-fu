import { describe, expect, it } from 'vitest';
import { matchEndMessageSchema, matchStartMessageSchema } from '../src/index';
import { parseClientMessage, parseServerMessage } from '../src/parse';

describe('MATCH_START (host asks the server to begin the match)', () => {
  const message = { type: 'MATCH_START', payload: {} };

  it('is a plain envelope with an empty payload', () => {
    expect(matchStartMessageSchema.safeParse(message).success).toBe(true);
    const parsed = parseClientMessage(message);
    expect(parsed.ok && parsed.message.type).toBe('MATCH_START');
  });

  it.each([
    ['extra payload field', { type: 'MATCH_START', payload: { forced: true } }],
    ['extra top-level field', { ...message, seq: 1 }],
    ['missing payload', { type: 'MATCH_START' }],
    ['null payload', { type: 'MATCH_START', payload: null }],
    ['array payload', { type: 'MATCH_START', payload: [] }],
    ['wrong casing', { type: 'match_start', payload: {} }],
  ])('rejects %s', (_label, value) => {
    expect(parseClientMessage(value).ok).toBe(false);
  });

  it('only a client sends it', () => {
    expect(parseServerMessage(message).ok).toBe(false);
  });
});

describe('MATCH_END (host ends the match and returns the room to the lobby)', () => {
  const message = { type: 'MATCH_END', payload: {} };

  it('is a plain envelope with an empty payload, sent only by a client', () => {
    expect(matchEndMessageSchema.safeParse(message).success).toBe(true);
    const parsed = parseClientMessage(message);
    expect(parsed.ok && parsed.message.type).toBe('MATCH_END');
    expect(parseServerMessage(message).ok).toBe(false);
  });

  it.each([
    ['extra payload field', { type: 'MATCH_END', payload: { forced: true } }],
    ['missing payload', { type: 'MATCH_END' }],
    ['wrong casing', { type: 'match_end', payload: {} }],
  ])('rejects %s', (_label, value) => {
    expect(parseClientMessage(value).ok).toBe(false);
  });
});
