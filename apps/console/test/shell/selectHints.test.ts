import { describe, expect, it } from 'vitest';
import { characterView } from '../../src/characters/videoPalette';
import type { CharacterSelectView, SelectSeatView } from '../../src/shell/model';
import {
  hintsLearned,
  loadLearnedHints,
  saveLearnedHints,
  selectHint,
} from '../../src/shell/selectHints';

// First-time help on character select (owner, 2026-11-14): brief, never in the way. One hint at a time, each gone for good
// on this TV once somebody has done what it shows.

const bread = characterView('bread');
const coffee = characterView('coffee');
const me = (ready: boolean): SelectSeatView => ({
  slot: 0,
  number: 1,
  kind: 'phone',
  id: 'a',
  name: 'Al',
  character: bread,
  ready,
});
const bot = (ready: boolean, chooser?: number): SelectSeatView => ({
  slot: 1,
  number: 2,
  kind: 'cpu',
  id: 'cpu:1',
  name: 'CPU 1',
  character: coffee,
  ready,
  ...(chooser !== undefined ? { chooser } : {}),
});
const view = (
  seats: SelectSeatView[],
  extra: Partial<CharacterSelectView> = {},
): CharacterSelectView => ({
  seats,
  grid: [],
  everyoneReady: seats.every((s) => s.kind === 'empty' || s.ready),
  bots: seats.filter((s) => s.kind === 'cpu').length,
  canAddBot: true,
  ...extra,
});
const none = new Set<never>();

describe('which hint character select shows', () => {
  it('a person choosing: how to choose and get READY', () => {
    expect(selectHint(view([me(false)]), none)).toBe('pick');
  });

  it('everyone READY and no bots yet: that the bar adds bots', () => {
    expect(selectHint(view([me(true)]), none)).toBe('bots');
  });

  it('a bot whose character a person is choosing: how to choose it (before anything else)', () => {
    expect(selectHint(view([me(true), bot(false, 1)]), none)).toBe('botPick');
  });

  it('nothing once there are bots and everyone is READY, nor after character select', () => {
    expect(selectHint(view([me(true), bot(true)]), none)).toBeUndefined();
    expect(
      selectHint(
        view([me(false)], {
          setup: { stage: 'MODE' } as unknown as NonNullable<CharacterSelectView['setup']>,
        }),
        none,
      ),
    ).toBeUndefined();
  });

  it('a hint already learned on this TV never shows again', () => {
    expect(selectHint(view([me(false)]), new Set(['pick'] as const))).toBeUndefined();
    expect(selectHint(view([me(true)]), new Set(['bots'] as const))).toBeUndefined();
    expect(
      selectHint(view([me(true), bot(false, 1)]), new Set(['botPick'] as const)),
    ).toBeUndefined();
  });

  it('a CPU-only table (no person) gets no bar hint: nobody there holds a phone', () => {
    expect(selectHint(view([]), none)).toBeUndefined();
  });
});

describe('when a hint counts as learned', () => {
  it('pick: a person got READY', () => {
    expect(hintsLearned(view([me(false)]), view([me(true)]))).toEqual(['pick']);
  });

  it('bots: a bot was added', () => {
    expect(hintsLearned(view([me(true)]), view([me(true), bot(false, 1)]))).toContain('bots');
  });

  it('botPick: the bot someone was choosing for became READY (not when it was taken away)', () => {
    const choosing = view([me(true), bot(false, 1)]);
    expect(hintsLearned(choosing, view([me(true), bot(true)]))).toContain('botPick');
    expect(hintsLearned(choosing, view([me(true)]))).not.toContain('botPick');
  });
});

describe('remembering learned hints on this TV', () => {
  const memory = (): Storage => {
    const m = new Map<string, string>();
    return {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => void m.set(k, v),
      removeItem: (k) => void m.delete(k),
      clear: () => m.clear(),
      key: () => null,
      get length() {
        return m.size;
      },
    };
  };

  it('round-trips, and ignores junk or blocked storage', () => {
    const s = memory();
    saveLearnedHints(new Set(['pick', 'bots']), s);
    expect([...loadLearnedHints(s)].sort()).toEqual(['bots', 'pick']);
    s.setItem('foomerang.selectHints', '{nope');
    expect(loadLearnedHints(s).size).toBe(0);
    s.setItem('foomerang.selectHints', '["pick","hack"]');
    expect([...loadLearnedHints(s)]).toEqual(['pick']);
    expect(loadLearnedHints(undefined).size).toBe(0);
    expect(() => saveLearnedHints(new Set(['pick']), undefined)).not.toThrow();
  });
});
