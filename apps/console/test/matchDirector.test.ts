import type { RosterEntry } from '@foomerang/protocol';
import { describe, expect, it } from 'vitest';
import { MatchDirector } from '../src/runtime/matchDirector';
import { spawnPosition } from '../src/runtime/arena';

const entry = (
  playerId: string,
  displayName: string,
  overrides: Partial<RosterEntry> = {},
): RosterEntry => ({
  playerId,
  displayName,
  connection: 'CONNECTED',
  seat: 'HELD',
  ...overrides,
});

const pos = (d: MatchDirector, id: string) =>
  d.runtime.world?.bodies.find((b) => b.id === id)?.position;

describe('MatchDirector: room participants → game bodies', () => {
  it('gives people in the lobby a slot but no body: nothing is simulated yet', () => {
    const d = new MatchDirector();
    d.onRoom('LOBBY', [entry('a', 'Alvin'), entry('b', 'David')], 0);
    expect(d.slots.slotOf('a')).toBe(0);
    expect(d.slots.slotOf('b')).toBe(1);
    expect(d.runtime.world).toBeUndefined();
    expect(d.arenaView()).toBeUndefined();
  });

  it('creates a body for each seated player when the room starts PLAYING, at the slot’s spawn point', () => {
    const d = new MatchDirector();
    const r = [entry('a', 'Alvin'), entry('b', 'David')];
    d.onRoom('LOBBY', r, 0);
    d.onRoom('PLAYING', r, 10);
    expect(pos(d, 'a')).toEqual(spawnPosition(0));
    expect(pos(d, 'b')).toEqual(spawnPosition(1));
  });

  it('does not give a body to a participant whose seat was already released', () => {
    const d = new MatchDirector();
    const r = [
      entry('a', 'Alvin'),
      entry('b', 'David', { seat: 'RELEASED', connection: 'DISCONNECTED' }),
    ];
    d.onRoom('PLAYING', r, 0);
    expect(d.runtime.world?.bodies.map((b) => b.id)).toEqual(['a']);
  });

  it('starts the match once: repeated PLAYING snapshots (a reconnect, a roster tick) do not reset the arena', () => {
    const d = new MatchDirector();
    const r = [entry('a', 'Alvin')];
    d.onRoom('PLAYING', r, 0);
    d.onMovement('a', 1, 0, 0);
    d.frame(100);
    const moved = pos(d, 'a');
    d.onRoom('PLAYING', [entry('a', 'Alvin', { connection: 'RECONNECTING' })], 110);
    expect(pos(d, 'a')).toEqual(moved);
  });

  it('a reconnecting participant keeps the same body, slot and place, and stops while away', () => {
    const d = new MatchDirector();
    d.onRoom('PLAYING', [entry('a', 'Alvin')], 0);
    d.onMovement('a', 1, 0, 0);
    d.frame(100);
    d.onRoom('PLAYING', [entry('a', 'Alvin', { connection: 'RECONNECTING' })], 100);
    const parked = pos(d, 'a');
    d.onMovement('a', 1, 0, 120);
    d.frame(220);
    expect(pos(d, 'a')).toEqual(parked);
    d.onRoom('PLAYING', [entry('a', 'Alvin')], 220);
    d.onMovement('a', 1, 0, 230);
    d.frame(330);
    expect(pos(d, 'a')?.x).toBeGreaterThan(parked?.x ?? Infinity);
    expect(d.slots.slotOf('a')).toBe(0);
    expect(d.runtime.world?.bodies).toHaveLength(1);
  });

  it('a player who joins after the match started gets no body (the server refuses mid-match joins; we do not invent one)', () => {
    const d = new MatchDirector();
    d.onRoom('PLAYING', [entry('a', 'Alvin')], 0);
    d.onRoom('PLAYING', [entry('a', 'Alvin'), entry('late', 'Late')], 10);
    expect(d.runtime.world?.bodies.map((b) => b.id)).toEqual(['a']);
  });

  it('stays out of the arena when the room is not PLAYING; a restart (RESULTS → PLAYING) is a fresh match', () => {
    const d = new MatchDirector();
    const r = [entry('a', 'Alvin')];
    d.onRoom('PLAYING', r, 0);
    d.onMovement('a', 1, 0, 0);
    d.frame(200);
    d.onRoom('RESULTS', r, 210);
    expect(d.arenaView()).toBeUndefined();
    d.onRoom('PLAYING', r, 300);
    expect(pos(d, 'a')).toEqual(spawnPosition(0));
  });

  it('exposes a view built from authoritative state, with the roster’s names', () => {
    const d = new MatchDirector();
    const r = [entry('a', 'Alvin')];
    d.onRoom('PLAYING', r, 0);
    expect(d.arenaView()?.circles[0]).toMatchObject({ id: 'a', label: 'Alvin', number: 1 });
  });

  it('keeps a stable slot for a player even if the roster reorders', () => {
    const d = new MatchDirector();
    d.onRoom('LOBBY', [entry('a', 'A'), entry('b', 'B')], 0);
    d.onRoom('LOBBY', [entry('b', 'B'), entry('a', 'A')], 1);
    expect([d.slots.slotOf('a'), d.slots.slotOf('b')]).toEqual([0, 1]);
  });
});
