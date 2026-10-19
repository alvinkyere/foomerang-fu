import { createFuMatch } from '@foomerang/foomerang-fu';
import type { RosterEntry } from '@foomerang/protocol';
import { describe, expect, it } from 'vitest';
import { buildFuView } from '../src/render/fuView';
import { characterOf } from '../src/render/reconstructed/maps';
import { RECONSTRUCTED_MAPS } from '../src/render/reconstructed/maps';
import { MatchDirector } from '../src/runtime/matchDirector';
import type { MatchPlayer, MatchRuntime } from '../src/runtime/matchRuntime';
import { GameRuntime } from '../src/runtime/gameRuntime';
import { SlotAllocator } from '../src/runtime/slots';

// The character a player chose in character select is the character they play (game-setting.mp4): the director keeps
// every participant's pick, a match cannot begin until every person is READY, and the chosen character travels with the
// player's body into the match and onto the TV.

const entry = (playerId: string, displayName: string): RosterEntry => ({
  playerId,
  displayName,
  connection: 'CONNECTED',
  seat: 'HELD',
});

/** A runtime that remembers who it was started with. */
class Recording extends GameRuntime {
  started: readonly MatchPlayer[] = [];
  override start(players: readonly MatchPlayer[], nowMs: number): void {
    this.started = players;
    super.start(players, nowMs);
  }
}
const recordingDirector = (): { d: MatchDirector; last: () => Recording } => {
  let last: Recording | undefined;
  const d = new MatchDirector((): MatchRuntime => (last = new Recording()));
  return { d, last: () => last as Recording };
};

describe('MatchDirector: character picks', () => {
  it('gives everyone in the lobby a pick, people and CPUs', () => {
    const d = new MatchDirector();
    d.onRoom('LOBBY', [entry('a', 'Alvin')], 0, 'foomerang-fu');
    d.cpus.add('MEDIUM', 1);
    expect(d.picks.pick('a')).toEqual({ character: 'bread', ready: false });
    expect(d.picks.pick('cpu:1')?.ready).toBe(true);
  });

  it('a Foomerang Fu match cannot begin while a person is still choosing', () => {
    const d = new MatchDirector();
    d.onRoom('LOBBY', [entry('a', 'Alvin'), entry('b', 'David')], 0, 'foomerang-fu');
    d.picks.select('a');
    expect(d.startBlock()).toBe('NOT_READY');
    d.picks.select('b');
    expect(d.startBlock()).toBeUndefined();
  });

  it('too few players is said before "not ready" (one person cannot begin, ready or not)', () => {
    const d = new MatchDirector();
    d.onRoom('LOBBY', [entry('a', 'Alvin')], 0, 'foomerang-fu');
    expect(d.startBlock()).toBe('TOO_FEW');
  });

  it('other games have no character select: readiness does not block them', () => {
    const d = new MatchDirector();
    d.onRoom('LOBBY', [entry('a', 'Alvin'), entry('b', 'David')], 0, 'primitive-arena');
    expect(d.startBlock()).toBeUndefined();
  });

  it('starts each body with its player’s chosen character', () => {
    const { d, last } = recordingDirector();
    const r = [entry('a', 'Alvin'), entry('b', 'David')];
    d.onRoom('LOBBY', r, 0, 'foomerang-fu');
    d.picks.move('a', 'up'); // bread → milk
    d.picks.select('a');
    d.picks.select('b');
    d.onRoom('PLAYING', r, 10, 'foomerang-fu');
    expect(last().started.map((p) => [p.playerId, p.character])).toEqual([
      ['a', 'milk'],
      ['b', 'coffee'],
    ]);
  });

  it('a person goes back to choosing when the room returns to its lobby', () => {
    const d = new MatchDirector();
    const r = [entry('a', 'Alvin'), entry('b', 'David')];
    d.onRoom('LOBBY', r, 0, 'foomerang-fu');
    d.picks.select('a');
    d.picks.select('b');
    d.onRoom('PLAYING', r, 10, 'foomerang-fu');
    d.returnToLobby();
    expect(d.picks.pick('a')).toEqual({ character: 'bread', ready: false });
  });

  it('…and when the server takes the room back to its lobby by itself (no return-to-lobby on this console)', () => {
    const d = new MatchDirector();
    const r = [entry('a', 'Alvin'), entry('b', 'David')];
    d.onRoom('LOBBY', r, 0, 'foomerang-fu');
    d.picks.select('a');
    d.picks.select('b');
    d.onRoom('PLAYING', r, 10, 'foomerang-fu');
    d.onRoom('LOBBY', r, 20, 'foomerang-fu');
    expect(d.picks.pick('a')?.ready).toBe(false);
  });
});

describe('the chosen character on the TV', () => {
  const roster = [entry('a', 'Alvin'), entry('b', 'David')];
  const slots = (): SlotAllocator => {
    const s = new SlotAllocator();
    s.sync(roster.map((e) => ({ playerId: e.playerId, seated: true })));
    return s;
  };
  const state = createFuMatch([
    { id: 'a', slot: 0 },
    { id: 'b', slot: 1 },
  ]);

  it('each circle carries its player’s character', () => {
    const view = buildFuView(state, [], roster, slots(), new Map([['a', 'milk']]));
    expect(view.circles.map((c) => c.character)).toEqual(['milk', undefined]);
  });

  it('the renderer draws the chosen character, or the seat’s own when there is none', () => {
    const plaza = RECONSTRUCTED_MAPS.market_plaza;
    expect(characterOf(plaza.roster, { number: 1, character: 'milk' })).toBe('milk');
    expect(characterOf(plaza.roster, { number: 2 })).toBe('coffee');
  });

  it('a map that has no art for the chosen character draws the seat’s own (never nobody)', () => {
    const harbour = RECONSTRUCTED_MAPS.harbour_fort;
    const missing = (
      [
        'avocado',
        'bacon',
        'banana',
        'bread',
        'carrot',
        'coffee',
        'donut',
        'icecream',
        'milk',
        'watermelon',
      ] as const
    ).find((k) => !harbour.roster.includes(k));
    expect(missing).toBeDefined();
    const has = (k: string) => (harbour.roster as readonly string[]).includes(k);
    expect(characterOf(harbour.roster, { number: 1, character: missing }, has)).toBe(
      harbour.roster[0],
    );
  });
});
