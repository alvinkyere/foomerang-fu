import type { RosterEntry } from '@foomerang/protocol';
import { describe, expect, it } from 'vitest';
import { CpuRoster, MAX_PARTICIPANTS, isCpuId } from '../src/runtime/cpuRoster';
import { MatchDirector } from '../src/runtime/matchDirector';
import { loadFuRuntime } from '../src/runtime/lazyFuRuntime';

const human = (id: string, overrides: Partial<RosterEntry> = {}): RosterEntry => ({
  playerId: id,
  displayName: id.toUpperCase(),
  connection: 'CONNECTED',
  seat: 'HELD',
  ...overrides,
});

describe('CpuRoster', () => {
  it('adds, configures and removes CPUs with stable ids that cannot collide with a person', () => {
    const roster = new CpuRoster();
    const a = roster.add('EASY', 1);
    const b = roster.add('HARD', 1);
    expect([a?.id, b?.id]).toEqual(['cpu:1', 'cpu:2']);
    expect(isCpuId('cpu:1')).toBe(true);
    expect(isCpuId('p_8f3a')).toBe(false);
    roster.setDifficulty('cpu:1', 'MEDIUM');
    expect(roster.entries.map((c) => c.difficulty)).toEqual(['MEDIUM', 'HARD']);
    roster.remove('cpu:1');
    expect(roster.add('EASY', 1)?.id).toBe('cpu:3'); // ids are never reused
  });

  it('never exceeds six participants, humans and CPUs together', () => {
    const roster = new CpuRoster();
    for (let i = 0; i < 10; i += 1) roster.add('HARD', 2);
    expect(roster.entries).toHaveLength(MAX_PARTICIPANTS - 2);
    expect(new CpuRoster().add('EASY', MAX_PARTICIPANTS)).toBeUndefined();
  });

  it('tells subscribers about every change, and only about changes', () => {
    const roster = new CpuRoster();
    let calls = 0;
    const off = roster.subscribe(() => (calls += 1));
    roster.add('EASY', 0);
    roster.remove('nobody');
    roster.setDifficulty('cpu:1', 'HARD');
    expect(calls).toBe(2);
    off();
    roster.remove('cpu:1');
    expect(calls).toBe(2);
  });
});

/** A six-participant table: Human, Human, CPU Easy, CPU Medium, CPU Hard, CPU Hard. */
async function sixAtTheTable() {
  const d = new MatchDirector();
  const people = [human('a'), human('b')];
  d.onRoom('LOBBY', people, 0, 'foomerang-fu'); // people arrive first, then the host adds CPUs
  d.cpus.add('EASY', 2);
  d.cpus.add('MEDIUM', 2);
  d.cpus.add('HARD', 2);
  d.cpus.add('HARD', 2);
  d.onRoom('PLAYING', people, 0, 'foomerang-fu');
  await loadFuRuntime();
  await Promise.resolve();
  return d;
}
const debug = (d: MatchDirector) =>
  d.runtime.debugState() as {
    players: { id: string; slot: number; alive: boolean }[];
    cpus: { id: string; difficulty: string; throws: number }[];
    cpuDecisionMs: { decisions: number; maxMs: number };
  };

describe('CPUs in a running match: the same legal input path as people', () => {
  it('every participant gets a distinct, stable slot (colour, number, marker); CPUs are named and marked like anyone', async () => {
    const d = await sixAtTheTable();
    const slots = debug(d).players.map((p) => p.slot);
    expect(new Set(slots).size).toBe(6);
    expect(slots).toEqual([0, 1, 2, 3, 4, 5]);
    const view = d.arenaView();
    expect(view?.circles.map((c) => c.label)).toEqual(
      expect.arrayContaining(['CPU 1', 'CPU 2', 'CPU 3', 'CPU 4']),
    );
  });

  it('only the CPU participants have a software controller, each at its own difficulty; people have none', async () => {
    const d = await sixAtTheTable();
    expect(debug(d).cpus.map((c) => [c.id, c.difficulty])).toEqual([
      ['cpu:1', 'EASY'],
      ['cpu:2', 'MEDIUM'],
      ['cpu:3', 'HARD'],
      ['cpu:4', 'HARD'],
    ]);
  });

  it('CPUs act through the ordinary step: they move, throw and fight while a person who sends nothing stands still', async () => {
    const d = await sixAtTheTable();
    const bodies = () => d.runtime.world?.bodies ?? [];
    let spawn = new Map(bodies().map((p) => [p.id, { ...p.position }]));
    const farthest = new Map<string, number>(); // the greatest excursion from where the round started them
    const roundOf = () => (d.runtime as unknown as { state?: { round: number } }).state?.round;
    let round = roundOf();
    let now = 0;
    for (let i = 0; i < 60 * 20; i += 1) {
      now += 1000 / 60;
      d.frame(now);
      // every round starts everyone at a fresh place (owner, 2026-10-19): measure from that round's start
      if (roundOf() !== round) {
        round = roundOf();
        spawn = new Map(bodies().map((p) => [p.id, { ...p.position }]));
      }
      for (const p of bodies()) {
        const s = spawn.get(p.id);
        if (s === undefined) continue;
        const away = Math.hypot(p.position.x - s.x, p.position.y - s.y);
        farthest.set(p.id, Math.max(farthest.get(p.id) ?? 0, away));
      }
    }
    const moved = (id: string) => farthest.get(id) ?? 0;
    expect(moved('cpu:3')).toBeGreaterThan(20);
    expect(moved('a')).toBe(0); // a person who sends no thumb does not move
    const info = debug(d);
    expect(info.cpus.reduce((n, c) => n + c.throws, 0)).toBeGreaterThan(0);
    expect(info.cpuDecisionMs.decisions).toBeGreaterThan(0);
  });

  it('a CPU is always active, even though it has no connection; a person is active only while connected', async () => {
    const d = new MatchDirector();
    d.cpus.add('MEDIUM', 1);
    const people = [human('a', { connection: 'RECONNECTING' })];
    d.onRoom('PLAYING', people, 0, 'foomerang-fu');
    await loadFuRuntime();
    await Promise.resolve();
    let now = 0;
    for (let i = 0; i < 120; i += 1) {
      now += 1000 / 60;
      d.frame(now);
    }
    expect(debug(d).cpus).toHaveLength(1);
    expect(debug(d).cpuDecisionMs.decisions).toBeGreaterThan(100);
  });

  it('CPU participants do not exist on the network path: input addressed to a CPU id is ignored', async () => {
    const d = await sixAtTheTable();
    d.onMovement('cpu:3', 1, 0, 0); // a hostile phone cannot steer a CPU
    d.onAction({ playerId: 'cpu:3', eventId: 'e1', action: 'SECONDARY', phase: 'pressed' });
    d.frame(17);
    expect(debug(d).players).toHaveLength(6);
  });

  it('a seat released by a person frees nothing the CPUs hold: slots stay put', async () => {
    const d = new MatchDirector();
    d.cpus.add('EASY', 2);
    d.onRoom('LOBBY', [human('a'), human('b')], 0, 'foomerang-fu');
    const before = d.slots.slotOf('cpu:1');
    d.onRoom(
      'LOBBY',
      [human('a'), human('b', { seat: 'RELEASED', connection: 'DISCONNECTED' })],
      1,
      'foomerang-fu',
    );
    expect(d.slots.slotOf('cpu:1')).toBe(before);
    expect(d.slots.slotOf('b')).toBeUndefined();
  });
});
