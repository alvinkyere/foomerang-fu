import { FREE_FOR_ALL, createFuMatch, type FuState } from '@foomerang/foomerang-fu';
import type { RosterEntry } from '@foomerang/protocol';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFuView } from '../src/render/fuView';
import type { HudView } from '../src/render/viewModel';
import { SlotAllocator } from '../src/runtime/slots';
import { FocusManager } from '../src/shell/focus/FocusManager';
import { MATCH_END_TIMING as T, MatchEnd } from '../src/ui/MatchEnd';

// The end of a match, as the reference footage plays it ("foomerang - fu physics.mp4", 12:36.7–12:49.4, a Coffee win): a
// beat after the deciding kill, an iris closes on the winner; the final scoreboard stands on the dark (the winner's band
// pops, everyone else's fades); the arena comes back dimmed behind it with CONTINUE; CONTINUE brings "<CHARACTER> WINS!"
// and the results, revealed column by column, the winner last, then REMATCH / BACK TO MENU.

const roster: RosterEntry[] = [
  { playerId: 'a', displayName: 'Ash', connection: 'CONNECTED', seat: 'HELD' },
  { playerId: 'b', displayName: 'Rik', connection: 'CONNECTED', seat: 'HELD' },
  { playerId: 'c', displayName: 'Jas', connection: 'CONNECTED', seat: 'HELD' },
  { playerId: 'd', displayName: 'Price', connection: 'CONNECTED', seat: 'HELD' },
];
const slots = (): SlotAllocator => {
  const s = new SlotAllocator();
  s.sync(roster.map((e) => ({ playerId: e.playerId, seated: true })));
  return s;
};
const hud = (): HudView => {
  const state: FuState = {
    ...createFuMatch(
      roster.map((r, slot) => ({ id: r.playerId, slot })),
      { ...FREE_FOR_ALL },
    ),
    phase: 'MATCH_OVER',
    scores: { a: 9, b: 13, c: 11, d: 14 },
    matchOver: { winnerId: 'd' },
  };
  const characters = new Map([
    ['a', 'banana'],
    ['b', 'donut'],
    ['c', 'milk'],
    ['d', 'coffee'],
  ] as const);
  return buildFuView(state, [], roster, slots(), characters).hud as HudView;
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const mount = () => {
  const onRematch = vi.fn();
  const onLobby = vi.fn();
  const locate = vi.fn(() => ({ x: 0.75, y: 0.6 }));
  render(
    <FocusManager>
      <MatchEnd hud={hud()} waiting={[]} locate={locate} onRematch={onRematch} onLobby={onLobby} />
    </FocusManager>,
  );
  return { onRematch, onLobby, locate };
};
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const stage = () => document.querySelector('[data-stage]')?.getAttribute('data-stage');

describe('MatchEnd', () => {
  it('first a beat, then the iris closes on the winner, where they stand on screen', () => {
    const { locate } = mount();
    expect(stage()).toBe('beat');
    advance(T.beatMs);
    expect(stage()).toBe('iris');
    expect(locate).toHaveBeenCalledWith('d');
    const iris = document.querySelector('.me__iris') as HTMLElement;
    expect(iris.style.getPropertyValue('--x')).toBe('75%');
    expect(iris.style.getPropertyValue('--y')).toBe('60%');
  });

  it('then the final scoreboard on the dark: the winner’s band pops, the others fade; no CONTINUE yet', () => {
    mount();
    advance(T.beatMs + T.irisMs);
    expect(stage()).toBe('board');
    expect(document.querySelector('.me')?.getAttribute('data-backdrop')).toBe('dark');
    expect(document.querySelector('.sb__trophy')).not.toBeNull();
    const bands = [...document.querySelectorAll('.sb__band')];
    expect(bands.map((b) => b.hasAttribute('data-winner'))).toEqual([false, false, false, true]);
    expect(bands.map((b) => b.hasAttribute('data-faded'))).toEqual([true, true, true, false]);
    expect(screen.queryByRole('button', { name: 'CONTINUE' })).toBeNull();
  });

  it('the arena comes back, dimmed, and CONTINUE appears with the focus', () => {
    mount();
    advance(T.beatMs + T.irisMs + T.darkMs);
    expect(document.querySelector('.me')?.getAttribute('data-backdrop')).toBe('arena');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'CONTINUE' }));
  });

  it('CONTINUE brings the results: the title in the winner’s colour, columns revealed in seat order, the winner last', () => {
    mount();
    advance(T.beatMs + T.irisMs + T.darkMs);
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE' }));
    advance(T.boardOutMs);
    expect(stage()).toBe('results');
    const title = screen.getByRole('heading');
    expect(title.textContent).toBe('COFFEE WINS!');
    expect(title.style.getPropertyValue('--title')).toBe('#d6d6ce');
    const delays = [...document.querySelectorAll<HTMLElement>('.rs__column')].map((c) =>
      Number.parseInt(c.style.getPropertyValue('--at'), 10),
    );
    expect(delays).toEqual([
      T.titleMs,
      T.titleMs + T.columnMs,
      T.titleMs + 2 * T.columnMs,
      T.titleMs + 3 * T.columnMs,
    ]);
  });

  it('REMATCH and BACK TO MENU only work once they are shown; then REMATCH has the focus', () => {
    const { onRematch } = mount();
    advance(T.beatMs + T.irisMs + T.darkMs);
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE' }));
    advance(T.boardOutMs);
    fireEvent.click(screen.getByRole('button', { name: 'REMATCH' }));
    expect(onRematch).not.toHaveBeenCalled(); // still being revealed
    advance(T.titleMs + 4 * T.columnMs + T.panelMs + T.buttonsMs);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'REMATCH' }));
    fireEvent.click(screen.getByRole('button', { name: 'REMATCH' }));
    expect(onRematch).toHaveBeenCalledTimes(1);
  });
});
