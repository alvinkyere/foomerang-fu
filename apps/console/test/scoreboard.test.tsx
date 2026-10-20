import {
  DEFAULT_FU_CONFIG,
  FREE_FOR_ALL,
  createFuMatch,
  type FuState,
} from '@foomerang/foomerang-fu';
import type { RosterEntry } from '@foomerang/protocol';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildFuView } from '../src/render/fuView';
import type { HudView } from '../src/render/viewModel';
import { SlotAllocator } from '../src/runtime/slots';
import { FocusManager } from '../src/shell/focus/FocusManager';
import { Scoreboard } from '../src/ui/Scoreboard';

// The scoreboard between rounds, as "ff scoreboard.jpg" shows it (owner, 2026-10-19): after every round, over the arena, a
// band per player in seat order — their badge (P1… or BOT), their character's portrait, and a dot per kill to win, filled
// for each kill they have — the leader crowned, and CONTINUE, which starts the next round.

const roster: RosterEntry[] = [
  { playerId: 'a', displayName: 'Ash', connection: 'CONNECTED', seat: 'HELD' },
  { playerId: 'b', displayName: 'Rik', connection: 'CONNECTED', seat: 'HELD' },
  { playerId: 'cpu:1', displayName: 'CPU 1', connection: 'CONNECTED', seat: 'HELD' },
];
const slots = (): SlotAllocator => {
  const s = new SlotAllocator();
  s.sync(roster.map((e) => ({ playerId: e.playerId, seated: true })));
  return s;
};
const match = (): FuState =>
  createFuMatch(
    [
      { id: 'a', slot: 0 },
      { id: 'b', slot: 1 },
      { id: 'cpu:1', slot: 2 },
    ],
    { ...FREE_FOR_ALL, roundAdvance: 'ON_CONTINUE' },
  );
const atScoreboard = (scores: Record<string, number>): FuState => ({
  ...match(),
  phase: 'ROUND_OVER',
  scores,
  roundOver: { winnerId: 'a', resetInSeconds: 0, awaitingContinue: true },
});
const characters = new Map([
  ['a', 'coffee'],
  ['b', 'icecream'],
  ['cpu:1', 'carrot'],
] as const);

describe('the HUD while the scoreboard waits', () => {
  it('says SCOREBOARD (and not during the end beat), and every entry carries its character', () => {
    const beat = buildFuView(
      {
        ...atScoreboard({}),
        roundOver: { winnerId: 'a', resetInSeconds: 1, awaitingContinue: false },
      },
      [],
      roster,
      slots(),
      characters,
    ).hud;
    expect(beat?.phase).toBe('ROUND_OVER');
    const hud = buildFuView(atScoreboard({ a: 3 }), [], roster, slots(), characters).hud;
    expect(hud?.phase).toBe('SCOREBOARD');
    // the round's banner ("… is the last one standing") belongs to the end beat; the scoreboard replaces it
    expect(
      buildFuView(atScoreboard({ a: 3 }), [], roster, slots(), characters).banner,
    ).toBeUndefined();
    expect(hud?.entries.map((e) => [e.id, e.character])).toEqual([
      ['a', 'coffee'],
      ['b', 'icecream'],
      ['cpu:1', 'carrot'],
    ]);
  });
});

describe('Scoreboard', () => {
  const hud = (scores: Record<string, number>): HudView =>
    buildFuView(atScoreboard(scores), [], roster, slots(), characters).hud as HudView;
  const show = (scores: Record<string, number>, onContinue = vi.fn()) => {
    render(
      <FocusManager>
        <Scoreboard hud={hud(scores)} onContinue={onContinue} />
      </FocusManager>,
    );
    return onContinue;
  };
  const band = (name: RegExp) => screen.getByRole('listitem', { name });

  it('a band per player in seat order, people as P1 P2, CPUs as BOT', () => {
    show({ a: 5, b: 2, 'cpu:1': 7 });
    const bands = within(screen.getByRole('list', { name: 'Scores' })).getAllByRole('listitem');
    expect(bands.map((b) => b.querySelector('.sb__badge')?.textContent)).toEqual([
      'P1',
      'P2',
      'BOT',
    ]);
  });

  it('a dot for every kill to win, filled for each kill made', () => {
    show({ a: 5, b: 2, 'cpu:1': 7 });
    const ash = band(/^Ash: 5 of 14 kills/);
    expect(ash.querySelectorAll('.sb__dot')).toHaveLength(DEFAULT_FU_CONFIG.targetKills ?? 14);
    expect(ash.querySelectorAll('.sb__dot[data-filled]')).toHaveLength(5);
  });

  it('the leader is crowned; nobody is while nobody has a kill', () => {
    show({ a: 5, b: 2, 'cpu:1': 7 });
    expect(band(/^CPU 1/).querySelector('.sb__crown')).not.toBeNull();
    expect(band(/^Ash/).querySelector('.sb__crown')).toBeNull();
  });

  it('nobody crowned at 0–0', () => {
    show({});
    expect(document.querySelectorAll('.sb__crown')).toHaveLength(0);
  });

  it('a tiebreak is announced: who filled their meters together', () => {
    show({ a: 14, b: 14, 'cpu:1': 2 });
    expect(screen.getByRole('status').textContent).toMatch(/TIEBREAK: Ash and Rik/);
  });

  it('CONTINUE has the focus, and pressing it continues', () => {
    const onContinue = show({ a: 1 });
    const button = screen.getByRole('button', { name: 'CONTINUE' });
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
