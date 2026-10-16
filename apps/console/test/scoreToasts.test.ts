import { describe, expect, it } from 'vitest';
import type { ScoreEventView } from '../src/render/viewModel';
import { addScoreToasts } from '../src/ui/scoreToasts';

const kill = (key: string, playerId = 'a'): ScoreEventView => ({
  key,
  playerId,
  label: 'CPU 1',
  delta: 1,
  reason: 'KILL',
  kills: 1,
  victimLabel: 'CPU 2',
});

describe('score toasts', () => {
  it('a rematch on the same map that replays the same kill at the same moment never repeats a toast key', () => {
    // the view model keys a score event by (elapsed time, index): the same deterministic kill in the next match on the same
    // map has the same view key, while the previous match's toast may still be on screen
    let state = addScoreToasts({ toasts: [], serial: 0 }, [kill('1.7000:2')]);
    state = addScoreToasts(state, [kill('1.7000:2')]);
    const keys = state.toasts.map((t) => t.key);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  it('keeps the four newest, in order', () => {
    let state = { toasts: [] as readonly ScoreEventView[], serial: 0 };
    for (const p of ['a', 'b', 'c', 'd', 'e', 'f']) state = addScoreToasts(state, [kill('0:0', p)]);
    expect(state.toasts.map((t) => t.playerId)).toEqual(['c', 'd', 'e', 'f']);
  });
});
