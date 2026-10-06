import {
  SYSTEMS_ARENA,
  SYSTEMS_POWERUP_SPOTS,
  createFuMatch,
  systemsView,
} from '@foomerang/foomerang-fu';
import type { RosterEntry } from '@foomerang/protocol';
import { describe, expect, it } from 'vitest';
import { buildFuView } from '../src/render/fuView';
import { parseArenaParam } from '../src/runtime/powerupMode';
import { FuRuntime } from '../src/runtime/fuRuntime';
import { LazyFuRuntime, loadFuRuntime } from '../src/runtime/lazyFuRuntime';
import { SlotAllocator } from '../src/runtime/slots';

// Slice 6 in the console: choosing the experimental arena, and handing the rules' system state to the renderer.

const players = [
  { playerId: 'a', slot: 0 },
  { playerId: 'b', slot: 3 },
];
const roster: RosterEntry[] = players.map((p, i) => ({
  playerId: p.playerId,
  displayName: i === 0 ? 'Alvin' : 'David',
  connection: 'CONNECTED',
  seat: 'HELD',
}));
const slots = () => {
  const s = new SlotAllocator();
  s.sync(roster.map((r) => ({ playerId: r.playerId, seated: true })));
  return s;
};

describe('?arena= (a page-address choice between the baseline arena and the Slice 6 arena)', () => {
  it('knows exactly "systems"; anything else is the baseline arena', () => {
    expect(parseArenaParam('?arena=systems')).toBe('systems');
    for (const junk of ['', '?arena=', '?arena=SYSTEMS', '?arena=primitive', '?arenas=systems']) {
      expect(parseArenaParam(junk), junk).toBe('primitive');
    }
  });

  it('the lazy stand-in loads the systems arena when asked, with Book spots clear of every system', async () => {
    const lazy = new LazyFuRuntime('normal', undefined, 'systems');
    lazy.start(players, 0);
    await loadFuRuntime();
    expect(lazy.state?.config.arena).toBe(SYSTEMS_ARENA);
    expect(lazy.state?.config.powerups?.spots).toEqual(SYSTEMS_POWERUP_SPOTS);
  });

  it('plays the baseline arena by default', async () => {
    const lazy = new LazyFuRuntime();
    lazy.start(players, 0);
    await loadFuRuntime();
    expect(lazy.state?.config.arena.gates).toBeUndefined();
  });
});

describe("the rules' arena-system state reaches the view, and nothing is decided here", () => {
  it('the view carries gates, platforms and hazards exactly as the rules compute them', () => {
    const state = createFuMatch(
      [
        { id: 'a', slot: 0 },
        { id: 'b', slot: 3 },
      ],
      { arena: SYSTEMS_ARENA },
    );
    for (const roundTime of [0, 4.5, 6.5, 8, 11.9]) {
      const timed = {
        ...state,
        roundTime,
        gatesShut: [roundTime >= 6 && roundTime < 12, roundTime >= 6 && roundTime < 12],
      };
      expect(buildFuView(timed, [], roster, slots()).systems).toEqual(
        systemsView(SYSTEMS_ARENA, roundTime, timed.gatesShut),
      );
    }
    const view = buildFuView(state, [], roster, slots()).systems;
    expect(view.gates).toHaveLength(2);
    expect(view.platforms).toHaveLength(2);
    expect(view.hazards).toHaveLength(2);
    expect(view.gates.every((g) => g.status === 'OPEN')).toBe(true);
    expect(view.hazards.every((h) => h.phase === 'SAFE')).toBe(true);
  });

  it('a gate held open by something in it is drawn as CLOSING and flagged held', () => {
    const state = {
      ...createFuMatch([{ id: 'a', slot: 0 }], { arena: SYSTEMS_ARENA }),
      roundTime: 7,
      gatesShut: [false, true],
    };
    const [left, right] = buildFuView(state, [], roster, slots()).systems.gates;
    expect(left).toMatchObject({ status: 'CLOSING', held: true });
    expect(right).toMatchObject({ status: 'CLOSED', held: false });
  });

  it('arenas without systems draw none; the debug snapshot reports the round clock and systems', () => {
    const plain = createFuMatch([{ id: 'a', slot: 0 }]);
    expect(buildFuView(plain, [], roster, slots()).systems).toEqual({
      gates: [],
      platforms: [],
      hazards: [],
    });
    const runtime = new FuRuntime(SYSTEMS_ARENA, 'off');
    runtime.start(players, 0);
    const debug = runtime.debugState() as {
      roundTime: number;
      systems: { hazards: { phase: string }[] };
    };
    expect(debug.roundTime).toBe(0);
    expect(debug.systems.hazards.map((h) => h.phase)).toEqual(['SAFE', 'SAFE']);
  });

  it('plays through the real frame loop: the round clock and the platform move with simulated time', () => {
    const runtime = new FuRuntime(SYSTEMS_ARENA, 'off');
    runtime.start(players, 0);
    let now = 0;
    for (let i = 0; i < 120; i += 1) runtime.frame((now += 1000 / 60));
    const view = runtime.view(roster, slots());
    expect(view?.systems.platforms[0]?.rect.x).toBeGreaterThan(650);
    expect(runtime.state?.roundTime).toBeGreaterThan(1.9);
  });
});
