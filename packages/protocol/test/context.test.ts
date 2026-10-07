import { describe, expect, it } from 'vitest';
import {
  CONTROLLER_CONTEXTS,
  SECONDARY_ACTION_LABELS,
  controllerContextMessageSchema,
  controllerContextSetMessageSchema,
  parseClientMessage,
  parseServerMessage,
} from '../src/index';

const set = (overrides: Record<string, unknown> = {}) => ({
  type: 'CONTROLLER_CONTEXT',
  seq: 3,
  payload: { context: 'CONSOLE', secondaryAction: null },
  ...overrides,
});
const toPhone = (payload: Record<string, unknown> = {}) => ({
  type: 'CONTROLLER_CONTEXT',
  payload: { context: 'CONSOLE', secondaryAction: null, version: 4, ...payload },
});

describe('CONTROLLER_CONTEXT: what the controls mean right now (never which screen is showing)', () => {
  it('has exactly four semantic contexts and a small fixed set of secondary labels', () => {
    expect([...CONTROLLER_CONTEXTS]).toEqual(['GAMEPLAY', 'CONSOLE', 'PAUSED', 'RESULTS']);
    expect(SECONDARY_ACTION_LABELS.length).toBeLessThanOrEqual(4);
  });

  it('host → server: a state message (seq) naming a context and an optional secondary action', () => {
    expect(controllerContextSetMessageSchema.safeParse(set()).success).toBe(true);
    for (const context of CONTROLLER_CONTEXTS) {
      expect(
        controllerContextSetMessageSchema.safeParse(
          set({ payload: { context, secondaryAction: null } }),
        ).success,
      ).toBe(true);
    }
    for (const label of SECONDARY_ACTION_LABELS) {
      expect(
        controllerContextSetMessageSchema.safeParse(
          set({ payload: { context: 'CONSOLE', secondaryAction: { label } } }),
        ).success,
      ).toBe(true);
    }
  });

  it('server → controller: the same meaning plus the room’s authoritative version', () => {
    expect(controllerContextMessageSchema.safeParse(toPhone()).success).toBe(true);
    expect(controllerContextMessageSchema.safeParse(toPhone({ version: 0 })).success).toBe(false);
    expect(controllerContextMessageSchema.safeParse(toPhone({ version: undefined })).success).toBe(
      false,
    );
  });

  it.each([
    ['an unknown context', set({ payload: { context: 'HOME', secondaryAction: null } })],
    [
      'a screen name smuggled as a context',
      set({ payload: { context: 'SETTINGS', secondaryAction: null } }),
    ],
    ['a missing secondaryAction', set({ payload: { context: 'CONSOLE' } })],
    [
      'a free-text label',
      set({
        payload: { context: 'CONSOLE', secondaryAction: { label: 'Open the pod bay doors' } },
      }),
    ],
    [
      'an extra payload key',
      set({ payload: { context: 'CONSOLE', secondaryAction: null, screen: 'HOME' } }),
    ],
    [
      'a missing seq',
      { type: 'CONTROLLER_CONTEXT', payload: { context: 'CONSOLE', secondaryAction: null } },
    ],
    ['a negative seq', set({ seq: -1 })],
    ['a lower-case context', set({ payload: { context: 'console', secondaryAction: null } })],
  ])('rejects %s', (_name, message) => {
    expect(parseClientMessage(message)).toEqual({ ok: false, code: 'INVALID_MESSAGE' });
  });

  it('a controller-style message with a version is not a valid host message (and vice versa)', () => {
    expect(parseClientMessage(toPhone())).toEqual({ ok: false, code: 'INVALID_MESSAGE' });
    expect(parseServerMessage(set())).toEqual({ ok: false, code: 'INVALID_MESSAGE' });
  });

  it('parses in each direction to the right typed message', () => {
    const fromHost = parseClientMessage(set());
    expect(
      fromHost.ok && fromHost.message.type === 'CONTROLLER_CONTEXT' && fromHost.message.seq,
    ).toBe(3);
    const toController = parseServerMessage(toPhone({ context: 'PAUSED', version: 9 }));
    expect(
      toController.ok &&
        toController.message.type === 'CONTROLLER_CONTEXT' &&
        toController.message.payload,
    ).toEqual({ context: 'PAUSED', secondaryAction: null, version: 9 });
  });
});
