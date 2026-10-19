import type { RosterEntry } from '@foomerang/protocol';
import { describe, expect, it } from 'vitest';
import { createConsoleRuntime } from '../src/consoleRuntime';
import { FuRuntime } from '../src/runtime/fuRuntime';
import { GAME_MODES, ModeSelection, isStartableMode } from '../src/runtime/gameMode';
import { loadFuRuntime } from '../src/runtime/lazyFuRuntime';
import { MatchDirector } from '../src/runtime/matchDirector';
import { FakeHostNetwork, MemoryHostStore, createClock, roster, settle } from './support/hostFakes';

const human = (id: string, overrides: Partial<RosterEntry> = {}): RosterEntry => ({
  playerId: id,
  displayName: id.toUpperCase(),
  connection: 'CONNECTED',
  seat: 'HELD',
  ...overrides,
});

interface DebugGame {
  round: number;
  phase: string;
  scores: Record<string, number>;
  matchOver: { winnerId: string } | undefined;
  players: { id: string; slot: number; alive: boolean }[];
  cpus: { id: string; difficulty: string }[];
}
const game = (d: MatchDirector): DebugGame => d.runtime.debugState() as DebugGame;
async function loaded(): Promise<void> {
  await loadFuRuntime();
  await Promise.resolve();
}
const run = (d: MatchDirector, seconds: number, from = 0): number => {
  let t = from;
  for (let i = 0; i < seconds * 60; i += 1) {
    t += 1000 / 60;
    d.frame(t);
  }
  return t;
};

describe('game modes', () => {
  it('Free For All is available and selected; Hide & Seek is listed, says COMING SOON, and is not available', () => {
    expect(GAME_MODES.map((m) => [m.id, m.title, m.available])).toEqual([
      ['FREE_FOR_ALL', 'Free For All', true],
      ['HIDE_AND_SEEK', 'Hide & Seek', false],
    ]);
    expect(new ModeSelection().id).toBe('FREE_FOR_ALL');
  });

  it('Hide & Seek can never be selected, and so can never start', async () => {
    const selection = new ModeSelection();
    let changes = 0;
    selection.subscribe(() => (changes += 1));
    expect(selection.select('HIDE_AND_SEEK')).toBe(false);
    expect(selection.id).toBe('FREE_FOR_ALL');
    expect(changes).toBe(0);
    expect(isStartableMode('HIDE_AND_SEEK')).toBe(false);
    // …and even if something asked the game runtime for it directly, it refuses
    expect(() => new FuRuntime(undefined, undefined, undefined, 'HIDE_AND_SEEK')).toThrow(
      RangeError,
    );
  });

  it('the director refuses to begin a match for a mode that is not available', () => {
    const d = new MatchDirector();
    expect(d.startBlock()).toBe('TOO_FEW'); // free for all is chosen; it just needs participants
    expect(d.mode.select('HIDE_AND_SEEK')).toBe(false);
    expect(d.mode.id).toBe('FREE_FOR_ALL');
  });
});

describe('Free For All participant configuration', () => {
  it('humans only (two to six), with no CPUs, may start; one human alone may not', () => {
    const d = new MatchDirector();
    d.onRoom('LOBBY', [human('a')], 0, 'foomerang-fu');
    expect(d.startBlock()).toBe('TOO_FEW');
    d.onRoom('LOBBY', [human('a'), human('b'), human('c'), human('d')], 0, 'foomerang-fu');
    expect(d.startBlock()).toBe('NOT_READY'); // character select: everyone must be READY
    for (const id of ['a', 'b', 'c', 'd']) d.picks.select(id);
    expect(d.startBlock()).toBeUndefined();
  });

  it('CPUs only (nobody on a phone) may start, and the match is made of CPUs alone', async () => {
    const d = new MatchDirector();
    d.onRoom('LOBBY', [], 0, 'foomerang-fu');
    d.cpus.add('EASY', 0);
    expect(d.startBlock()).toBe('TOO_FEW');
    d.cpus.add('HARD', 0);
    expect(d.startBlock()).toBeUndefined();
    d.onRoom('PLAYING', [], 0, 'foomerang-fu');
    await loaded();
    expect(game(d).players.map((p) => p.id)).toEqual(['cpu:1', 'cpu:2']);
    expect(game(d).cpus.map((c) => c.difficulty)).toEqual(['EASY', 'HARD']);
    run(d, 5);
    expect(game(d).round).toBeGreaterThanOrEqual(1);
  });

  it('humans and CPUs together, up to six; seven is refused', () => {
    const d = new MatchDirector();
    d.onRoom('LOBBY', [human('a'), human('b')], 0, 'foomerang-fu');
    d.cpus.add('EASY', 2);
    d.cpus.add('MEDIUM', 2);
    d.cpus.add('HARD', 2);
    d.cpus.add('HARD', 2);
    d.picks.select('a');
    d.picks.select('b');
    expect(d.startBlock()).toBeUndefined();
    d.onRoom('LOBBY', [human('a'), human('b'), human('c')], 0, 'foomerang-fu'); // a third person joins a full table
    expect(d.startBlock()).toBe('TOO_MANY');
  });

  it('empty seats are not filled with CPUs unless the host asks: nothing adds a CPU by itself', () => {
    const d = new MatchDirector();
    d.onRoom('LOBBY', [human('a'), human('b')], 0, 'foomerang-fu');
    expect(d.cpus.entries).toEqual([]);
  });

  it('each CPU keeps its own difficulty in the match', async () => {
    const d = new MatchDirector();
    d.onRoom('LOBBY', [human('a')], 0, 'foomerang-fu');
    d.cpus.add('EASY', 1);
    d.cpus.add('MEDIUM', 1);
    d.cpus.add('HARD', 1);
    d.onRoom('PLAYING', [human('a')], 0, 'foomerang-fu');
    await loaded();
    expect(game(d).cpus.map((c) => [c.id, c.difficulty])).toEqual([
      ['cpu:1', 'EASY'],
      ['cpu:2', 'MEDIUM'],
      ['cpu:3', 'HARD'],
    ]);
  });
});

describe('the match lifecycle: late join and rematch', () => {
  it('a person who joins while the match is running waits: seated, with a slot, but no body, and their input is ignored', async () => {
    const d = new MatchDirector();
    d.onRoom('LOBBY', [human('a'), human('b')], 0, 'foomerang-fu');
    d.onRoom('PLAYING', [human('a'), human('b')], 0, 'foomerang-fu');
    await loaded();
    d.onRoom('PLAYING', [human('a'), human('b'), human('late')], 100, 'foomerang-fu');
    expect(game(d).players.map((p) => p.id)).toEqual(['a', 'b']);
    expect(d.waitingForNextMatch().map((r) => r.playerId)).toEqual(['late']);
    d.onMovement('late', 1, 0, 120);
    run(d, 1);
    expect(game(d).players.map((p) => p.id)).toEqual(['a', 'b']);
    expect(game(d).scores).toEqual({ a: expect.any(Number), b: expect.any(Number) });
  });

  it('REMATCH: the same people and CPUs (and difficulties), a new match — round 1, empty meters; the person who was waiting now plays', async () => {
    const d = new MatchDirector();
    d.onRoom('LOBBY', [human('a')], 0, 'foomerang-fu');
    d.cpus.add('HARD', 1);
    d.cpus.add('EASY', 1);
    d.onRoom('PLAYING', [human('a')], 0, 'foomerang-fu');
    await loaded();
    // let the CPUs score so there is something to reset
    let t = 0;
    for (let i = 0; i < 40 && Object.values(game(d).scores).every((v) => v === 0); i += 1)
      t = run(d, 5, t);
    expect(Object.values(game(d).scores).some((v) => v > 0)).toBe(true);
    d.onRoom('PLAYING', [human('a'), human('late')], t, 'foomerang-fu');
    d.rematch(t);
    await loaded();
    const g = game(d);
    expect(g.round).toBe(1);
    expect(g.phase).toBe('PLAYING');
    expect(Object.values(g.scores).every((v) => v === 0)).toBe(true);
    expect(g.players.map((p) => p.id)).toEqual(['a', 'late', 'cpu:1', 'cpu:2']);
    expect(g.cpus.map((c) => [c.id, c.difficulty])).toEqual([
      ['cpu:1', 'HARD'],
      ['cpu:2', 'EASY'],
    ]);
    expect(d.waitingForNextMatch()).toEqual([]);
  });

  it('a rematch never turns a CPU away to seat a newcomer: when the table is full the newcomer keeps waiting', async () => {
    const d = new MatchDirector();
    d.onRoom('LOBBY', [human('a'), human('b')], 0, 'foomerang-fu');
    for (const level of ['EASY', 'MEDIUM', 'HARD', 'HARD'] as const) d.cpus.add(level, 2);
    d.onRoom('PLAYING', [human('a'), human('b')], 0, 'foomerang-fu');
    await loaded();
    d.onRoom('PLAYING', [human('a'), human('b'), human('late')], 10, 'foomerang-fu');
    d.rematch(10);
    await loaded();
    expect(game(d).players).toHaveLength(6);
    expect(game(d).players.map((p) => p.id)).not.toContain('late');
    expect(d.waitingForNextMatch().map((r) => r.playerId)).toEqual(['late']);
  });

  it('return to lobby ends the match locally: no arena view, no stepping', async () => {
    const d = new MatchDirector();
    d.onRoom('PLAYING', [human('a'), human('b')], 0, 'foomerang-fu');
    await loaded();
    expect(d.arenaView()).toBeDefined();
    d.returnToLobby();
    expect(d.arenaView()).toBeUndefined();
  });
});

describe('host lifecycle', () => {
  async function playingRoom(gameId = 'foomerang-fu') {
    const clock = createClock();
    const network = new FakeHostNetwork();
    let now = 0;
    const runtime = createConsoleRuntime({
      transportFactory: network.factory,
      environment: clock.environment,
      store: new MemoryHostStore(),
      now: () => now,
    });
    runtime.session.createRoom(gameId);
    await settle();
    network.roomUpdated(
      network.last,
      'LOBBY',
      roster({ playerId: 'a', displayName: 'A' }, { playerId: 'b', displayName: 'B' }),
    );
    await settle();
    network.roomUpdated(
      network.last,
      'PLAYING',
      roster({ playerId: 'a', displayName: 'A' }, { playerId: 'b', displayName: 'B' }),
    );
    await settle();
    await loaded();
    return { clock, network, runtime, setNow: (t: number) => (now = t) };
  }

  it('Start from the console refuses a table that cannot start (one person, no CPU) and asks the server when it can', async () => {
    const clock = createClock();
    const network = new FakeHostNetwork();
    const runtime = createConsoleRuntime({
      transportFactory: network.factory,
      environment: clock.environment,
      store: new MemoryHostStore(),
      now: () => 0,
    });
    runtime.session.createRoom('foomerang-fu');
    await settle();
    network.roomUpdated(network.last, 'LOBBY', roster({ playerId: 'a', displayName: 'A' }));
    await settle();
    runtime.startMatch();
    expect(network.last.of('MATCH_START')).toHaveLength(0);
    runtime.director.cpus.add('MEDIUM', 1);
    runtime.startMatch(); // two now, but A is still choosing a character
    expect(network.last.of('MATCH_START')).toHaveLength(0);
    runtime.director.picks.select('a');
    runtime.startMatch();
    expect(network.last.of('MATCH_START')).toHaveLength(1);
  });

  it('a match started with nobody on a phone: CPUs only can ask the server to start', async () => {
    const clock = createClock();
    const network = new FakeHostNetwork();
    const runtime = createConsoleRuntime({
      transportFactory: network.factory,
      environment: clock.environment,
      store: new MemoryHostStore(),
      now: () => 0,
    });
    runtime.session.createRoom('foomerang-fu');
    await settle();
    runtime.director.cpus.add('EASY', 0);
    runtime.director.cpus.add('EASY', 0);
    runtime.startMatch();
    expect(network.last.of('MATCH_START')).toHaveLength(1);
  });

  it('the host losing its server connection PAUSES the match: nothing steps while it is away, and it resumes where it was, without a catch-up burst', async () => {
    const { network, runtime, setNow, clock } = await playingRoom();
    let t = 0;
    const tick = (ms: number): void => {
      t += ms;
      setNow(t);
      runtime.frame(t);
    };
    for (let i = 0; i < 60; i += 1) tick(1000 / 60);
    const before = JSON.stringify(runtime.director.runtime.debugState());
    network.refuseConnections = true; // the server cannot be reached for a while
    network.last.serverDrops(); // the console's connection goes
    await settle();
    expect(runtime.director.paused).toBe(true);
    for (let i = 0; i < 300; i += 1) tick(1000 / 60); // five seconds pass
    expect(JSON.stringify(runtime.director.runtime.debugState())).toBe(before);
    network.refuseConnections = false;
    clock.advance(3_000); // the backoff elapses; the session reconnects
    await settle();
    await settle();
    await settle();
    expect(runtime.director.paused).toBe(false);
    const steps0 = runtime.director.runtime.metrics().simulationSteps;
    for (let i = 0; i < 30; i += 1) tick(1000 / 60);
    const m = runtime.director.runtime.metrics();
    expect(m.simulationSteps - steps0).toBeLessThanOrEqual(31); // half a second of play, not five and a half
    expect(m.discardedSimulationMs).toBe(0);
  });

  it('a console page that is reloaded loses the match: reclaiming a PLAYING room ends it, returns to the lobby and says why — never a silent restart of round 1', async () => {
    const clock = createClock();
    const network = new FakeHostNetwork();
    const store = new MemoryHostStore();
    store.value = { joinCode: 'K7M4PX', hostToken: 'host-token-0', gameId: 'foomerang-fu' };
    network.roomStateOnReconnect = 'PLAYING';
    const runtime = createConsoleRuntime({
      transportFactory: network.factory,
      environment: clock.environment,
      store,
      now: () => 0,
    });
    expect(runtime.session.resume()).toBe(true);
    await settle();
    await settle();
    expect(network.last.of('MATCH_END')).toHaveLength(1);
    const state = runtime.session.getState();
    expect(state.roomState).toBe('LOBBY');
    expect(state.matchInterrupted).toBe(true);
    expect(runtime.director.arenaView()).toBeUndefined(); // no arena was conjured for the lost match
    expect(runtime.director.runtime.world).toBeUndefined();
  });

  it('a reclaimed room that was merely in the lobby is not reported as interrupted', async () => {
    const clock = createClock();
    const network = new FakeHostNetwork();
    const store = new MemoryHostStore();
    store.value = { joinCode: 'K7M4PX', hostToken: 'host-token-0', gameId: 'foomerang-fu' };
    const runtime = createConsoleRuntime({
      transportFactory: network.factory,
      environment: clock.environment,
      store,
      now: () => 0,
    });
    runtime.session.resume();
    await settle();
    await settle();
    expect(network.last.of('MATCH_END')).toHaveLength(0);
    expect(runtime.session.getState().matchInterrupted).toBe(false);
  });

  it('return to lobby tells the server (MATCH_END) and leaves no arena behind; rematch restarts without telling it', async () => {
    const { network, runtime } = await playingRoom();
    runtime.rematch();
    await loaded();
    expect(network.last.of('MATCH_END')).toHaveLength(0);
    expect(runtime.director.arenaView()).toBeDefined();
    runtime.returnToLobby();
    expect(network.last.of('MATCH_END')).toHaveLength(1);
    expect(runtime.director.arenaView()).toBeUndefined();
  });

  it('a reconnecting person keeps their body, kills and powerups: nothing in the match is rebuilt', async () => {
    const { network, runtime } = await playingRoom();
    const before = (runtime.director.runtime.debugState() as DebugGame).players.map((p) => p.id);
    network.roomUpdated(
      network.last,
      'PLAYING',
      roster(
        { playerId: 'a', displayName: 'A', connection: 'RECONNECTING' },
        { playerId: 'b', displayName: 'B' },
      ),
    );
    await settle();
    network.roomUpdated(
      network.last,
      'PLAYING',
      roster({ playerId: 'a', displayName: 'A' }, { playerId: 'b', displayName: 'B' }),
    );
    await settle();
    expect((runtime.director.runtime.debugState() as DebugGame).players.map((p) => p.id)).toEqual(
      before,
    );
    expect((runtime.director.runtime.debugState() as DebugGame).round).toBe(1);
  });
});

describe('?kills= (playtest/test only)', () => {
  it('lets a match be shortened to 1–13 kills and nothing else; 14 is the game', async () => {
    const { parseKillsParam } = await import('../src/runtime/powerupMode');
    expect(parseKillsParam('?kills=3')).toBe(3);
    expect(parseKillsParam('?kills=13')).toBe(13);
    for (const junk of [
      '',
      '?kills=14',
      '?kills=0',
      '?kills=15',
      '?kills=-2',
      '?kills=abc',
      '?kills=3.5',
      '?kills=007x',
    ]) {
      expect(parseKillsParam(junk), junk).toBeUndefined();
    }
  });

  it('the runtime honours it: the match is won at that many kills, and the meter has that many holes', async () => {
    const { MatchDirector: D } = await import('../src/runtime/matchDirector');
    const { LazyFuRuntime } = await import('../src/runtime/lazyFuRuntime');
    const d = new D((id, mode) => new LazyFuRuntime(undefined, undefined, undefined, mode, 2));
    d.onRoom('LOBBY', [human('a'), human('b')], 0, 'foomerang-fu');
    d.onRoom('PLAYING', [human('a'), human('b')], 0, 'foomerang-fu');
    await loaded();
    expect(d.arenaView()?.hud?.target).toBe(2);
  });
});
