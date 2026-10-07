import {
  FREE_FOR_ALL,
  createFuMatch,
  rematchOf,
  type FuEvent,
  type FuState,
} from '@foomerang/foomerang-fu';
import type { RosterEntry } from '@foomerang/protocol';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildFuView } from '../src/render/fuView';
import { SLOT_STYLES, SlotAllocator } from '../src/runtime/slots';
import { FocusManager } from '../src/shell/focus/FocusManager';
import { ChampionScreen, Meter, ScoreStrip, Standings, scoreToast } from '../src/ui/Hud';

// The race is the rules' fact; the HUD only draws it. These tests read the view the HUD is built from, and the HUD.

const entries: RosterEntry[] = [
  { playerId: 'a', displayName: 'Alvin', connection: 'CONNECTED', seat: 'HELD' },
  { playerId: 'b', displayName: 'Bea', connection: 'CONNECTED', seat: 'HELD' },
  { playerId: 'cpu:1', displayName: 'CPU 1', connection: 'CONNECTED', seat: 'HELD' },
];
const slots = (() => {
  const s = new SlotAllocator();
  s.sync(entries.map((e) => ({ playerId: e.playerId, seated: true })));
  return s;
})();
const match = (extra: Partial<FuState> = {}): FuState => ({
  ...createFuMatch(
    [
      { id: 'a', slot: 0 },
      { id: 'b', slot: 1 },
      { id: 'cpu:1', slot: 2 },
    ],
    { ...FREE_FOR_ALL },
  ),
  ...extra,
});
const hudOf = (state: FuState, events: FuEvent[] = []) => {
  const hud = buildFuView(state, events, entries, slots).hud;
  if (hud === undefined) throw new Error('no HUD');
  return hud;
};

describe("the HUD view model (built from the rules' state; nothing invented)", () => {
  it('has a row per player, in player order, with name, marker, number, colour and kills; CPUs are marked', () => {
    const hud = hudOf(match({ scores: { a: 8, b: 0, 'cpu:1': 3 } }));
    expect(hud.target).toBe(14);
    expect(hud.entries.map((e) => [e.id, e.label, e.kills, e.cpu])).toEqual([
      ['a', 'Alvin', 8, false],
      ['b', 'Bea', 0, false],
      ['cpu:1', 'CPU 1', 3, true],
    ]);
    expect(hud.entries[0]).toMatchObject({
      marker: SLOT_STYLES[0]?.marker,
      number: 1,
      color: SLOT_STYLES[0]?.color,
    });
  });

  it('labels the rounds: ROUND n / 9, then OVERTIME ROUND k, and a TIEBREAK', () => {
    expect(hudOf(match()).roundLabel).toBe('ROUND 1 / 9');
    expect(hudOf(match({ round: 9 })).roundLabel).toBe('ROUND 9 / 9');
    expect(hudOf(match({ round: 10 })).roundLabel).toBe('OVERTIME ROUND 1');
    expect(hudOf(match({ round: 12 })).roundLabel).toBe('OVERTIME ROUND 3');
    expect(hudOf(match({ round: 5, tiebreak: true })).roundLabel).toBe('TIEBREAK');
  });

  it('shows the champion only once the match is won, and who filled their meters together before a tiebreak', () => {
    expect(hudOf(match()).champion).toBeUndefined();
    const won = match({
      phase: 'MATCH_OVER',
      matchOver: { winnerId: 'b' },
      scores: { a: 3, b: 14, 'cpu:1': 0 },
    });
    expect(hudOf(won).champion).toMatchObject({ id: 'b', kills: 14 });
    const tie = match({
      phase: 'ROUND_OVER',
      roundOver: { winnerId: undefined, resetInSeconds: 2 },
      scores: { a: 14, b: 14, 'cpu:1': 2 },
    });
    expect(hudOf(tie).tiebreak).toEqual(['a', 'b']);
  });

  it('turns SCORE events into feedback: a hole filled, a hole emptied, a penalty at zero', () => {
    const events: FuEvent[] = [
      { type: 'SCORE', playerId: 'a', victimId: 'b', delta: 1, reason: 'KILL', kills: 4 },
      { type: 'SCORE', playerId: 'b', victimId: 'b', delta: -1, reason: 'ENVIRONMENT', kills: 2 },
      {
        type: 'SCORE',
        playerId: 'cpu:1',
        victimId: 'cpu:1',
        delta: 0,
        reason: 'SELF_KILL',
        kills: 0,
      },
    ];
    const hud = hudOf(match(), events);
    expect(hud.scoreEvents.map((e) => [e.playerId, e.delta, e.reason])).toEqual([
      ['a', 1, 'KILL'],
      ['b', -1, 'ENVIRONMENT'],
      ['cpu:1', 0, 'SELF_KILL'],
    ]);
    expect(new Set(hud.scoreEvents.map((e) => e.key)).size).toBe(3);
    expect(hud.scoreEvents.map(scoreToast)).toEqual([
      'Alvin +1 (Bea)',
      'Bea −1 (the floor)',
      'CPU 1: self-kill, already at 0',
    ]);
  });

  it('a rematch starts with every meter empty and round 1', () => {
    const over = match({
      phase: 'MATCH_OVER',
      matchOver: { winnerId: 'a' },
      scores: { a: 14, b: 9, 'cpu:1': 1 },
    });
    const hud = hudOf(rematchOf(over));
    expect(hud.entries.map((e) => e.kills)).toEqual([0, 0, 0]);
    expect(hud.roundLabel).toBe('ROUND 1 / 9');
    expect(hud.phase).toBe('PLAYING');
  });

  it('the round-over banner no longer calls a survivor the round winner (the race is in kills)', () => {
    const over = match({ phase: 'ROUND_OVER', roundOver: { winnerId: 'a', resetInSeconds: 2 } });
    expect(buildFuView(over, [], entries, slots).banner).toBe('Alvin is the last one standing');
  });
});

describe('the kill meter', () => {
  it('is fourteen circles: filled for each kill, empty for the rest; readable without colour', () => {
    const hud = hudOf(match({ scores: { a: 8, b: 0, 'cpu:1': 0 } }));
    const entry = hud.entries[0] as (typeof hud.entries)[number];
    render(<Meter entry={entry} target={14} />);
    const meter = screen.getByRole('img', { name: 'Alvin: 8 of 14 kills' });
    expect(meter.textContent).toBe('●'.repeat(8) + '○'.repeat(6));
  });

  it('the score strip shows every player with name, marker, number and "8 / 14", above (never over) the arena', () => {
    const hud = hudOf(match({ scores: { a: 8, b: 0, 'cpu:1': 3 } }));
    render(<ScoreStrip hud={hud} pulses={{}} />);
    expect(screen.getByText('ROUND 1 / 9')).toBeTruthy();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain('ALVIN');
    expect(rows[0]?.textContent).toContain('8 / 14');
    expect(rows[2]?.textContent).toContain('CPU 1');
    expect(rows[2]?.textContent).toContain('CPU');
    expect(rows[2]?.textContent).toContain('3 / 14');
  });

  it('animates only the hole that changed: a filled hole pops, a drained one flashes', () => {
    const hud = hudOf(match({ scores: { a: 8, b: 0, 'cpu:1': 3 } }));
    const { container, rerender } = render(
      <ScoreStrip hud={hud} pulses={{ a: { kind: 'fill', hole: 7, key: 'k1' } }} />,
    );
    const popped = container.querySelectorAll('.hole.fill');
    expect(popped).toHaveLength(1);
    expect(popped[0]?.textContent).toBe('●');
    rerender(<ScoreStrip hud={hud} pulses={{ a: { kind: 'drain', hole: 8, key: 'k2' } }} />);
    const drained = container.querySelectorAll('.hole.drain');
    expect(drained).toHaveLength(1);
    expect(drained[0]?.textContent).toBe('○');
  });
});

describe('standings and the champion screen', () => {
  it('between rounds the complete standings are shown big, best first, and a tiebreak is announced', () => {
    const hud = hudOf(
      match({
        phase: 'ROUND_OVER',
        roundOver: { winnerId: undefined, resetInSeconds: 2 },
        scores: { a: 14, b: 14, 'cpu:1': 2 },
      }),
    );
    render(<Standings hud={hud} />);
    expect(screen.getByRole('status').textContent).toMatch(/Tiebreak: Alvin and Bea/);
    const rows = within(screen.getByLabelText('Standings')).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent?.match(/[A-Z0-9 ]+/)?.[0]?.trim())).toEqual([
      expect.stringContaining('ALVIN'),
      expect.stringContaining('BEA'),
      expect.stringContaining('CPU'),
    ]);
  });

  it('the champion screen names the champion, shows the final meters, and offers REMATCH or RETURN TO LOBBY', () => {
    const hud = hudOf(
      match({
        phase: 'MATCH_OVER',
        matchOver: { winnerId: 'b' },
        scores: { a: 12, b: 14, 'cpu:1': 4 },
      }),
    );
    const rematch = vi.fn();
    const lobby = vi.fn();
    render(
      <FocusManager>
        <ChampionScreen hud={hud} waiting={['Cleo']} onRematch={rematch} onLobby={lobby} />
      </FocusManager>,
    );
    // operable without a mouse: focus starts on Rematch (a phone's SELECT, Enter, A)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Rematch' }));
    expect(screen.getByRole('dialog', { name: 'Match over' }).textContent).toContain(
      'BEA WINS THE MATCH',
    );
    expect(screen.getAllByRole('img').map((m) => m.getAttribute('aria-label'))).toEqual([
      'Bea: 14 of 14 kills',
      'Alvin: 12 of 14 kills',
      'CPU 1: 4 of 14 kills',
    ]);
    expect(screen.getByText(/Waiting for the next match: Cleo/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rematch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return to lobby' }));
    expect(rematch).toHaveBeenCalledOnce();
    expect(lobby).toHaveBeenCalledOnce();
  });
});
