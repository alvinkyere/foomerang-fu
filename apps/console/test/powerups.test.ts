import {
  DEFAULT_FU_CONFIG,
  PRIMITIVE_ARENA,
  PRIMITIVE_POWERUPS,
  createFuMatch,
  type FuState,
} from '@foomerang/foomerang-fu';
import type { RosterEntry } from '@foomerang/protocol';
import { describe, expect, it } from 'vitest';
import { buildFuView } from '../src/render/fuView';
import { parsePowerupsParam } from '../src/runtime/powerupMode';
import { FuRuntime } from '../src/runtime/fuRuntime';
import { LazyFuRuntime, loadFuRuntime } from '../src/runtime/lazyFuRuntime';
import { SLOT_STYLES, SlotAllocator } from '../src/runtime/slots';

// Powerups in the console: how fast they appear (a page-address choice), and how the rules' powerup
// state becomes a view the renderer draws. The renderer decides nothing.

const roster: RosterEntry[] = [
  { playerId: 'a', displayName: 'Alvin', connection: 'CONNECTED', seat: 'HELD' },
  { playerId: 'b', displayName: 'David', connection: 'CONNECTED', seat: 'HELD' },
];
const slots = () => {
  const s = new SlotAllocator();
  s.sync(roster.map((r) => ({ playerId: r.playerId, seated: true })));
  return s;
};
const players = [
  { playerId: 'a', slot: 0 },
  { playerId: 'b', slot: 3 },
];
const fresh = (): FuState =>
  createFuMatch([
    { id: 'a', slot: 0 },
    { id: 'b', slot: 3 },
  ]);

describe('?powerups= (a page-address choice, never arbitrary rules)', () => {
  it('knows exactly fast and off; anything else is normal', () => {
    expect(parsePowerupsParam('?powerups=fast')).toBe('fast');
    expect(parsePowerupsParam('?game=foomerang-fu&powerups=off')).toBe('off');
    for (const junk of [
      '',
      '?powerups=',
      '?powerups=FAST',
      '?powerups=1',
      '?powerups=fast;x',
      '?powerup=fast',
    ]) {
      expect(parsePowerupsParam(junk), junk).toBe('normal');
    }
  });

  it('the primitive arena gets pickups on the shipped schedule, fast gets one a second, off gets none', () => {
    const config = (r: FuRuntime) => r.state?.config.powerups;
    const normal = new FuRuntime();
    normal.start(players, 0);
    expect(config(normal)).toEqual(PRIMITIVE_POWERUPS);
    const fast = new FuRuntime(PRIMITIVE_ARENA, 'fast');
    fast.start(players, 0);
    expect(config(fast)).toMatchObject({ firstSeconds: 1, intervalSeconds: 1, maxOnField: 5 });
    expect(config(fast)?.spots).toEqual(PRIMITIVE_POWERUPS.spots);
    const off = new FuRuntime(PRIMITIVE_ARENA, 'off');
    off.start(players, 0);
    expect(config(off)).toBeUndefined();
  });

  it('an arena with no places to put pickups (the open Slice 1 arena) never has any, whatever the mode', () => {
    const open = new FuRuntime(DEFAULT_FU_CONFIG.arena, 'fast');
    open.start(players, 0);
    expect(open.state?.config.powerups).toBeUndefined();
  });

  it('the lazy stand-in passes the mode on to the real runtime', async () => {
    const lazy = new LazyFuRuntime('fast');
    lazy.start(players, 0);
    await loadFuRuntime();
    expect(lazy.state?.config.powerups?.firstSeconds).toBe(1);
  });

  it('pickups really appear on the fast schedule through the real frame loop (and not before)', () => {
    const runtime = new FuRuntime(PRIMITIVE_ARENA, 'fast');
    runtime.start(players, 0);
    let now = 0;
    for (let i = 0; i < 50; i += 1) runtime.frame((now += 1000 / 60));
    expect(runtime.state?.pickups).toHaveLength(0);
    for (let i = 0; i < 40; i += 1) runtime.frame((now += 1000 / 60));
    expect(runtime.state?.pickups.length).toBeGreaterThan(0);
    const debug = runtime.debugState() as { pickups: { kind: string; x: number }[] };
    expect(debug.pickups[0]).toMatchObject({ kind: 'OVERDRIVE', x: 800 });
  });

  it('reports powers and phase state in the read-only debug snapshot', () => {
    const runtime = new FuRuntime(PRIMITIVE_ARENA, 'off');
    runtime.start(players, 0);
    const debug = runtime.debugState() as {
      players: { powers: Record<string, unknown>; phasing: boolean; inWall: boolean }[];
      boomerangs: { blast: boolean }[];
    };
    expect(debug.players[0]).toMatchObject({
      powers: { overdrive: 0, blast: false, guard: false, twin: false, phase: 0 },
      phasing: false,
      inWall: false,
    });
    expect(debug.boomerangs[0]?.blast).toBe(false);
    expect(() => JSON.stringify(debug)).not.toThrow();
  });
});

describe('buildFuView: powerup state → what Phaser draws', () => {
  const entries = roster;
  const base = fresh();
  const withPowers = (patch: object): FuState => ({
    ...base,
    players: base.players.map((p, i) =>
      i === 0 ? { ...p, powers: { ...p.powers, ...patch } } : p,
    ),
  });

  it('lists the powers a player holds, in a fixed order, and nothing for the dead', () => {
    const view = buildFuView(
      withPowers({ overdrive: 3, guard: true, twin: true, phase: 1, blast: true }),
      [],
      entries,
      slots(),
    );
    expect(view.circles[0]?.powers).toEqual([
      'OVERDRIVE',
      'BLAST_BOOMERANG',
      'GUARD',
      'TWIN_THROW',
      'PHASE_DASH',
    ]);
    expect(view.circles[1]?.powers).toEqual([]);
    const dead: FuState = {
      ...withPowers({ guard: true }),
      players: withPowers({ guard: true }).players.map((p, i) =>
        i === 0 ? { ...p, alive: false } : p,
      ),
    };
    expect(buildFuView(dead, [], entries, slots()).circles[0]?.powers).toEqual([]);
  });

  it('an armed boomerang in flight still counts as the player holding BLAST_BOOMERANG', () => {
    const s: FuState = {
      ...base,
      boomerangs: base.boomerangs.map((b, i) =>
        i === 0 ? { ...b, state: 'THROWN', blast: true, direction: { x: 1, y: 0 } } : b,
      ),
    };
    const view = buildFuView(s, [], entries, slots());
    expect(view.circles[0]?.powers).toEqual(['BLAST_BOOMERANG']);
    expect(view.boomerangs[0]).toMatchObject({ id: 'a', ownerId: 'a', blast: true });
  });

  it('draws twin boomerangs as separate boomerangs with their own ids, own first', () => {
    const [mine, theirs] = base.boomerangs as [
      (typeof base.boomerangs)[number],
      (typeof base.boomerangs)[number],
    ];
    const own = { ...mine, state: 'THROWN' as const, direction: { x: 1, y: 0 } };
    const s: FuState = {
      ...base,
      boomerangs: [own, theirs],
      extraBoomerangs: [{ ...own, position: { x: 400, y: 300 } }],
    };
    const view = buildFuView(s, [], entries, slots());
    expect(view.boomerangs.map((b) => b.id)).toEqual(['a', 'a#2']);
    expect(view.boomerangs.every((b) => b.ownerId === 'a')).toBe(true);
    expect(view.boomerangs[1]).toMatchObject({ x: 400, y: 300 });
  });

  it('marks a player mid Phase Dash as phasing, and whether they are in a wall right now', () => {
    const dashing = (inside: boolean): FuState => ({
      ...base,
      players: base.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              dash: {
                phase: 'DASHING',
                direction: { x: 1, y: 0 },
                remaining: 0.1,
                speed: 1100,
                phasing: { origin: { x: 0, y: 0 }, limit: 100, travelled: 40, inside },
              },
            }
          : p,
      ),
    });
    expect(buildFuView(dashing(true), [], entries, slots()).circles[0]?.phasing).toEqual({
      inWall: true,
    });
    expect(buildFuView(dashing(false), [], entries, slots()).circles[0]?.phasing).toEqual({
      inWall: false,
    });
    expect(buildFuView(base, [], entries, slots()).circles[0]?.phasing).toBeUndefined();
  });

  it('hands over the pickups lying in the arena exactly as the rules have them', () => {
    const s: FuState = {
      ...base,
      pickups: [
        { id: 3, kind: 'GUARD', position: { x: 10, y: 20 } },
        { id: 4, kind: 'TWIN_THROW', position: { x: 30, y: 40 } },
      ],
    };
    expect(buildFuView(s, [], entries, slots()).pickups).toEqual([
      { id: 3, kind: 'GUARD', x: 10, y: 20 },
      { id: 4, kind: 'TWIN_THROW', x: 30, y: 40 },
    ]);
    expect(buildFuView(base, [], entries, slots()).pickups).toEqual([]);
  });

  it('turns the powerup events into drawable ones, placed and coloured', () => {
    const view = buildFuView(
      base,
      [
        { type: 'POWERUP_SPAWNED', pickupId: 1, kind: 'GUARD', position: { x: 5, y: 6 } },
        {
          type: 'PICKED_UP',
          playerId: 'b',
          kind: 'PHASE_DASH',
          pickupId: 1,
          position: { x: 7, y: 8 },
        },
        { type: 'POWER_EXPIRED', playerId: 'a', kind: 'OVERDRIVE' },
        { type: 'BLASTED', ownerId: 'a', position: { x: 9, y: 10 }, radius: 170, victims: ['b'] },
        { type: 'GUARD_BLOCKED', playerId: 'b', byId: 'a', position: { x: 11, y: 12 } },
        { type: 'PHASE_ENTERED', playerId: 'a', position: { x: 13, y: 14 } },
        { type: 'PHASE_EXITED', playerId: 'a', position: { x: 15, y: 16 } },
        {
          type: 'DASHED',
          playerId: 'a',
          position: { x: 1, y: 2 },
          direction: { x: 1, y: 0 },
          phasing: true,
        },
      ],
      entries,
      slots(),
    );
    expect(view.events).toEqual([
      { type: 'SPAWNED', x: 5, y: 6, color: '#FFFFFF', kind: 'GUARD' },
      { type: 'PICKUP', x: 7, y: 8, color: SLOT_STYLES[1]?.color, kind: 'PHASE_DASH' },
      {
        type: 'EXPIRED',
        ...base.world.bodies[0]?.position,
        color: SLOT_STYLES[0]?.color,
        kind: 'OVERDRIVE',
      },
      { type: 'BLASTED', x: 9, y: 10, color: SLOT_STYLES[0]?.color, radius: 170 },
      { type: 'GUARD_BLOCKED', x: 11, y: 12, color: SLOT_STYLES[1]?.color },
      { type: 'PHASE_ENTERED', x: 13, y: 14, color: SLOT_STYLES[0]?.color },
      { type: 'PHASE_EXITED', x: 15, y: 16, color: SLOT_STYLES[0]?.color },
      {
        type: 'DASHED',
        x: 1,
        y: 2,
        color: SLOT_STYLES[0]?.color,
        direction: { x: 1, y: 0 },
        phasing: true,
      },
    ]);
  });

  it('is pure: the same state gives the same view', () => {
    const s = withPowers({ guard: true, phase: 2 });
    expect(buildFuView(s, [], entries, slots())).toEqual(buildFuView(s, [], entries, slots()));
  });
});
