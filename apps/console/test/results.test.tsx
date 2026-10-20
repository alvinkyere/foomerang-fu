import { FREE_FOR_ALL, createFuMatch, type FuState } from '@foomerang/foomerang-fu';
import type { RosterEntry } from '@foomerang/protocol';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { resultsColour, resultsPanel } from '../src/characters/videoPalette';
import { buildFuView } from '../src/render/fuView';
import type { HudView } from '../src/render/viewModel';
import { SlotAllocator } from '../src/runtime/slots';
import { FocusManager } from '../src/shell/focus/FocusManager';
import { ResultsScreen, placings } from '../src/ui/Results';

// The end of the match, as "foomerang fu results.jpg" shows it (owner, 2026-10-19): "<CHARACTER> WINS!" in red, a column
// per player in seat order — their character in a soft circle, a ribbon with their placing (ties share it: 1, 2, 2, 2, 5),
// the winner on a crimson panel with a crown — and REMATCH / BACK TO MENU. (Award pills are a later slice.)

const roster: RosterEntry[] = [
  { playerId: 'a', displayName: 'Ash', connection: 'CONNECTED', seat: 'HELD' },
  { playerId: 'b', displayName: 'Rik', connection: 'CONNECTED', seat: 'HELD' },
  { playerId: 'c', displayName: 'Jas', connection: 'CONNECTED', seat: 'HELD' },
  { playerId: 'cpu:1', displayName: 'CPU 1', connection: 'CONNECTED', seat: 'HELD' },
];
const slots = (): SlotAllocator => {
  const s = new SlotAllocator();
  s.sync(roster.map((e) => ({ playerId: e.playerId, seated: true })));
  return s;
};
const over = (scores: Record<string, number>, winnerId: string): FuState => ({
  ...createFuMatch(
    roster.map((r, slot) => ({ id: r.playerId, slot })),
    { ...FREE_FOR_ALL },
  ),
  phase: 'MATCH_OVER',
  scores,
  matchOver: { winnerId },
});
const characters = new Map([
  ['a', 'donut'],
  ['b', 'watermelon'],
  ['c', 'milk'],
  ['cpu:1', 'bread'],
] as const);
const hudOf = (scores: Record<string, number>, winnerId: string): HudView =>
  buildFuView(over(scores, winnerId), [], roster, slots(), characters).hud as HudView;

describe('placings', () => {
  it('rank by kills; ties share a place and the next place skips (1, 2, 2, 2, 5)', () => {
    const hud = hudOf({ a: 9, b: 14, c: 9, 'cpu:1': 9 }, 'b');
    expect(Object.fromEntries(placings(hud.entries, 'b'))).toEqual({
      b: 1,
      a: 2,
      c: 2,
      'cpu:1': 2,
    });
    const spread = hudOf({ a: 3, b: 14, c: 9, 'cpu:1': 3 }, 'b');
    expect(Object.fromEntries(placings(spread.entries, 'b'))).toEqual({
      b: 1,
      c: 2,
      a: 3,
      'cpu:1': 3,
    });
  });

  it('the winner is first even level on kills with someone (a tiebreak decided it)', () => {
    const hud = hudOf({ a: 14, b: 14, c: 0, 'cpu:1': 0 }, 'a');
    expect(placings(hud.entries, 'a').get('a')).toBe(1);
    expect(placings(hud.entries, 'a').get('b')).toBe(2);
  });
});

describe('ResultsScreen', () => {
  const show = (scores: Record<string, number>, winnerId: string, waiting: string[] = []) => {
    const onRematch = vi.fn();
    const onLobby = vi.fn();
    render(
      <FocusManager>
        <ResultsScreen
          hud={hudOf(scores, winnerId)}
          waiting={waiting}
          onRematch={onRematch}
          onLobby={onLobby}
        />
      </FocusManager>,
    );
    return { onRematch, onLobby };
  };

  it('names the winning character: WATERMELON WINS!', () => {
    show({ a: 9, b: 14, c: 9, 'cpu:1': 2 }, 'b');
    expect(screen.getByRole('heading').textContent).toBe('WATERMELON WINS!');
  });

  it('a column per player in seat order, each with their placing; the winner crowned on the crimson panel', () => {
    show({ a: 9, b: 14, c: 9, 'cpu:1': 2 }, 'b');
    const columns = within(screen.getByRole('list', { name: 'Results' })).getAllByRole('listitem');
    expect(columns.map((c) => c.getAttribute('aria-label'))).toEqual([
      'Ash, Donut: 2nd, 9 kills',
      'Rik, Watermelon: winner, 14 kills',
      'Jas, Milk: 2nd, 9 kills',
      'CPU 1, Bread: 4th, 2 kills',
    ]);
    expect(columns[1]?.hasAttribute('data-winner')).toBe(true);
    expect(columns[1]?.querySelector('.rs__crown')).not.toBeNull();
    expect(columns[0]?.querySelector('.rs__ribbon')?.textContent).toBe('2');
    expect(columns[1]?.querySelector('.rs__ribbon')).toBeNull();
  });

  it('REMATCH has the focus; BACK TO MENU returns to the lobby', () => {
    const { onRematch, onLobby } = show({ a: 9, b: 14, c: 0, 'cpu:1': 0 }, 'b');
    const rematch = screen.getByRole('button', { name: 'REMATCH' });
    expect(document.activeElement).toBe(rematch);
    fireEvent.click(rematch);
    fireEvent.click(screen.getByRole('button', { name: 'BACK TO MENU' }));
    expect(onRematch).toHaveBeenCalledTimes(1);
    expect(onLobby).toHaveBeenCalledTimes(1);
  });

  it('names who joined during the match and plays the next one', () => {
    show({ b: 14 }, 'b', ['Cleo']);
    expect(screen.getByText(/Waiting for the next match: Cleo/)).toBeTruthy();
  });

  it('is the match-over dialog (what the phones and the TV operate)', () => {
    show({ b: 14 }, 'b');
    expect(screen.getByRole('dialog', { name: 'Match over' })).toBeTruthy();
  });
});

describe('results colours', () => {
  it('are the image’s own for the five characters it shows', () => {
    expect(resultsColour('donut')).toBe('#f684af');
    expect(resultsColour('watermelon')).toBe('#e63954');
    expect(resultsColour('milk')).toBe('#77bafc');
    expect(resultsColour('bread')).toBe('#f6c76a');
    expect(resultsColour('sushi')).toBe('#d5f5ea');
  });

  it('the winner’s panel is their colour, darkened as the image darkens the watermelon’s (#e63954 → #a0263b)', () => {
    expect(resultsPanel('watermelon')).toBe('#a0263b');
    const lum = (hex: string) => {
      const n = Number.parseInt(hex.slice(1), 16);
      return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    };
    for (const id of ['bread', 'milk', 'banana'] as const)
      expect(lum(resultsPanel(id))).toBeLessThan(lum(resultsColour(id)) * 0.75);
  });
});
