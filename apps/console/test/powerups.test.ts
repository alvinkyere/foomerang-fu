import {
  DEFAULT_FU_CONFIG,
  PRIMITIVE_ARENA,
  PRIMITIVE_POWERUPS,
  createFuMatch,
  type FuState,
  type PowerKind,
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
    expect(parsePowerupsParam('?powerups=low')).toBe('low');
    expect(parsePowerupsParam('?powerups=high')).toBe('high');
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
    expect(normal.state?.config).toMatchObject({ targetKills: 14, regulationRounds: 9 }); // Free For All: first to 14, nine regulation rounds
    const low = new FuRuntime(PRIMITIVE_ARENA, 'low');
    low.start(players, 0);
    expect(config(low)).toMatchObject({ firstSeconds: 25, intervalSeconds: 90, maxOnField: 1 });
    const high = new FuRuntime(PRIMITIVE_ARENA, 'high');
    high.start(players, 0);
    expect(config(high)).toMatchObject({ firstSeconds: 10, intervalSeconds: 25, maxOnField: 1 });
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
    const debug = runtime.debugState() as { pickups: { x: number; y: number }[] };
    expect(debug.pickups[0]).toMatchObject({ x: 800, y: 295 });
    expect(Object.keys(debug.pickups[0] ?? {})).not.toContain('kind'); // a Book says nothing about what it awards
  });

  it('reports powers in the read-only debug snapshot', () => {
    const runtime = new FuRuntime(PRIMITIVE_ARENA, 'off');
    runtime.start(players, 0);
    const debug = runtime.debugState() as {
      players: { inventory: string[] }[];
      boomerangs: { blast: boolean }[];
    };
    expect(debug.players[0]).toMatchObject({ inventory: [] });
    expect(debug.boomerangs[0]?.blast).toBe(false);
    expect(() => JSON.stringify(debug)).not.toThrow();
  });
});

describe('buildFuView: powerup state → what Phaser draws', () => {
  const entries = roster;
  const base = fresh();
  const withInventory = (inventory: PowerKind[]): FuState => ({
    ...base,
    players: base.players.map((p, i) => (i === 0 ? { ...p, inventory } : p)),
  });

  it('lists what a player OWNS in the order they got it (at most three); the dead keep theirs', () => {
    const owned = withInventory(['EXPLOSIVE_BOOMERANG', 'EXTRA_BOOMERANG', 'SHIELD']);
    const view = buildFuView(owned, [], entries, slots());
    expect(view.circles[0]?.powers).toEqual(['EXPLOSIVE_BOOMERANG', 'EXTRA_BOOMERANG', 'SHIELD']);
    expect(view.circles[1]?.powers).toEqual([]);
    const dead: FuState = {
      ...owned,
      players: owned.players.map((p, i) => (i === 0 ? { ...p, alive: false } : p)),
    };
    expect(buildFuView(dead, [], entries, slots()).circles[0]?.powers).toEqual([
      'EXPLOSIVE_BOOMERANG',
      'EXTRA_BOOMERANG',
      'SHIELD',
    ]);
  });

  it('draws an armed boomerang as armed (a rules fact on the boomerang, separate from owning the power)', () => {
    const s: FuState = {
      ...base,
      boomerangs: base.boomerangs.map((b, i) =>
        i === 0 ? { ...b, state: 'THROWN', blast: true, direction: { x: 1, y: 0 } } : b,
      ),
    };
    const view = buildFuView(s, [], entries, slots());
    expect(view.boomerangs[0]).toMatchObject({ id: 'a', ownerId: 'a', blast: true });
    expect(view.circles[0]?.powers).toEqual([]);
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

  it('draws the pieces of a Multi split, each under a name that holds while its fan thins out; the split one is not drawn', () => {
    const [mine, theirs] = base.boomerangs as [
      (typeof base.boomerangs)[number],
      (typeof base.boomerangs)[number],
    ];
    const piece = (slot: number) => ({
      ...mine,
      state: 'THROWN' as const,
      direction: { x: 1, y: 0 },
      pieceOf: 0,
      pieceSlot: slot,
    });
    const s: FuState = {
      ...base,
      boomerangs: [{ ...mine, state: 'SPENT' as const, splitInto: true }, theirs],
      extraBoomerangs: [piece(1), piece(4)],
    };
    const view = buildFuView(s, [], entries, slots());
    expect(view.boomerangs.filter((b) => b.ownerId === 'a').map((b) => b.id)).toEqual([
      'a#1.1',
      'a#1.4',
    ]);
  });

  it('a frozen player is drawn frozen, and FROZEN / THAWED reach the TV at the player', () => {
    const s: FuState = {
      ...base,
      players: base.players.map((p) => (p.id === 'a' ? { ...p, frozen: 1.2 } : p)),
    };
    const at = s.world.bodies.find((b) => b.id === 'a')?.position ?? { x: 0, y: 0 };
    const view = buildFuView(
      s,
      [
        { type: 'FROZEN', playerId: 'a', byId: 'b', position: at },
        { type: 'THAWED', playerId: 'a', position: at },
      ],
      entries,
      slots(),
    );
    expect(view.circles.find((c) => c.id === 'a')?.frozen).toBe(true);
    expect(view.circles.find((c) => c.id === 'b')?.frozen).toBeUndefined();
    expect(view.events.map((e) => [e.type, e.actor])).toEqual([
      ['FROZEN', 'a'],
      ['THAWED', 'a'],
    ]);
  });

  it('a burning player is drawn burning; fire and ice boomerangs are marked for what they leave on the ground', () => {
    const [mine, theirs] = base.boomerangs as [
      (typeof base.boomerangs)[number],
      (typeof base.boomerangs)[number],
    ];
    const s: FuState = {
      ...base,
      players: base.players.map((p) =>
        p.id === 'a' ? { ...p, burning: { seconds: 1, byId: 'b', creditedTo: 'b' } } : p,
      ),
      boomerangs: [
        { ...mine, state: 'THROWN', direction: { x: 1, y: 0 }, fire: true },
        { ...theirs, state: 'THROWN', direction: { x: 1, y: 0 }, ice: true },
      ],
    };
    const view = buildFuView(s, [], entries, slots());
    expect(view.circles.find((c) => c.id === 'a')?.burning).toBe(true);
    expect(view.circles.find((c) => c.id === 'b')?.burning).toBeUndefined();
    expect(view.boomerangs.map((b) => b.mark)).toEqual(['fire', 'ice']);
  });

  it('Battle Royale: the closing border reaches the TV only while it closes', () => {
    const zone = { x: 100, y: 100, width: 1400, height: 700 };
    const arena = { ...base.config.arena, safeZone: zone };
    const open: FuState = { ...base, config: { ...base.config, arena } };
    expect(buildFuView(open, [], entries, slots()).closing).toBeUndefined();
    const closing: FuState = { ...open, closingSince: 0, roundTime: 0.5 };
    // (the border holds 0.9 s, then closes at 121 u/s a side)
    const later: FuState = { ...open, closingSince: 0, roundTime: 1.9 };
    expect(buildFuView(closing, [], entries, slots()).closing).toEqual({ ...zone, seconds: 0.5 }); // still holding
    expect(buildFuView(later, [], entries, slots()).closing).toEqual({
      x: 221,
      y: 221,
      width: 1158,
      height: 458,
      seconds: 1.9,
    });
  });

  it('a Multi split reaches the TV where it happened (the video flashes there)', () => {
    const view = buildFuView(
      base,
      [{ type: 'SPLIT', ownerId: 'a', position: { x: 300, y: 200 } }],
      entries,
      slots(),
    );
    expect(view.events).toEqual([expect.objectContaining({ type: 'SPLIT', x: 300, y: 200 })]);
  });

  it('an armed Explosive ticking where it landed reaches the TV with its fuse (the tick is drawn from it)', () => {
    const [mine, theirs] = base.boomerangs as [
      (typeof base.boomerangs)[number],
      (typeof base.boomerangs)[number],
    ];
    const s: FuState = {
      ...base,
      boomerangs: [{ ...mine, state: 'GROUNDED', blast: true, fuse: 0.3 }, theirs],
    };
    expect(
      buildFuView(s, [], entries, slots()).boomerangs.find((b) => b.ownerId === 'a')?.fuse,
    ).toBe(0.3);
  });

  it('hands over the Books lying in the arena with NO hint of what they award', () => {
    const s: FuState = {
      ...base,
      pickups: [
        { id: 3, position: { x: 10, y: 20 } },
        { id: 4, position: { x: 30, y: 40 } },
      ],
    };
    expect(buildFuView(s, [], entries, slots()).pickups).toEqual([
      { id: 3, x: 10, y: 20 },
      { id: 4, x: 30, y: 40 },
    ]);
    expect(buildFuView(base, [], entries, slots()).pickups).toEqual([]);
  });

  it('turns the powerup events into drawable ones; the award is named only in PICKUP', () => {
    const view = buildFuView(
      base,
      [
        { type: 'POWERUP_SPAWNED', pickupId: 1, position: { x: 5, y: 6 } },
        {
          type: 'PICKED_UP',
          playerId: 'b',
          kind: 'EXPLOSIVE_BOOMERANG',
          pickupId: 1,
          position: { x: 7, y: 8 },
        },
        { type: 'POWER_LOST', playerId: 'a', kind: 'CAFFEINATED', reason: 'EVICTED' },
        { type: 'POWER_LOST', playerId: 'b', kind: 'SHIELD', reason: 'SHIELD_BROKEN' },
        { type: 'BLASTED', ownerId: 'a', position: { x: 9, y: 10 }, radius: 170, victims: ['b'] },
        { type: 'SHIELD_BLOCKED', playerId: 'b', byId: 'a', position: { x: 11, y: 12 } },
        {
          type: 'DASHED',
          playerId: 'a',
          position: { x: 1, y: 2 },
          direction: { x: 1, y: 0 },
        },
      ],
      entries,
      slots(),
    );
    const here = base.world.bodies[0]?.position;
    const there = base.world.bodies[1]?.position;
    expect(view.events).toEqual([
      { type: 'SPAWNED', x: 5, y: 6, color: '#FFFFFF' },
      {
        type: 'PICKUP',
        x: 7,
        y: 8,
        actor: 'b', // who took it: the TV holds the power's badge over them
        color: SLOT_STYLES[1]?.color,
        kind: 'EXPLOSIVE_BOOMERANG',
        who: 'David',
      },
      {
        type: 'POWER_LOST',
        ...here,
        color: SLOT_STYLES[0]?.color,
        kind: 'CAFFEINATED',
        reason: 'EVICTED',
        who: 'Alvin',
      },
      {
        type: 'POWER_LOST',
        ...there,
        color: SLOT_STYLES[1]?.color,
        kind: 'SHIELD',
        reason: 'SHIELD_BROKEN',
        who: 'David',
      },
      { type: 'BLASTED', x: 9, y: 10, color: SLOT_STYLES[0]?.color, radius: 170 },
      { type: 'SHIELD_BLOCKED', x: 11, y: 12, color: SLOT_STYLES[1]?.color },
      {
        type: 'DASHED',
        x: 1,
        y: 2,
        color: SLOT_STYLES[0]?.color,
        actor: 'a',
        direction: { x: 1, y: 0 },
      },
    ]);
    // before collection nothing names a power
    expect(JSON.stringify(view.events[0])).not.toMatch(/CAFFEINATED|SHIELD|TWIN|EXPLOSIVE/);
  });

  it('is pure: the same state gives the same view', () => {
    const s = withInventory(['SHIELD', 'EXPLOSIVE_BOOMERANG']);
    expect(buildFuView(s, [], entries, slots())).toEqual(buildFuView(s, [], entries, slots()));
  });
});

describe('buildFuView: breakable props → what the renderer draws', () => {
  const base = fresh();

  it('a PROP_BROKEN event names the prop and where its breaker stood (the debris flies away from them)', () => {
    const view = buildFuView(
      base,
      [
        {
          type: 'PROP_BROKEN',
          id: 'POT_22_pots_0',
          byId: 'a',
          cause: 'SLASH',
          position: { x: 538, y: 982 },
        },
      ],
      roster,
      slots(),
    );
    expect(view.events).toEqual([
      {
        type: 'PROP_BROKEN',
        x: 538,
        y: 982,
        color: SLOT_STYLES[0]?.color,
        propId: 'POT_22_pots_0',
        from: base.world.bodies[0]?.position,
      },
    ]);
  });

  it('the view lists the props broken this round, exactly as the rules hold them', () => {
    expect(buildFuView(base, [], roster, slots()).broken).toEqual([]);
    const broken = { ...base, broken: ['CRATE_16_crates_0', 'POT_22_pots_1'] };
    expect(buildFuView(broken, [], roster, slots()).broken).toEqual([
      'CRATE_16_crates_0',
      'POT_22_pots_1',
    ]);
  });
});

describe('?enable= (the enabled power pool, for playtesting one power at a time)', () => {
  it("keeps only known names, in the rules' order; nothing valid means the default pool", async () => {
    const { parseEnabledParam } = await import('../src/runtime/powerupMode');
    expect(parseEnabledParam('?enable=SHIELD')).toEqual(['SHIELD']);
    // the rules' order, whatever order they were written in
    expect(parseEnabledParam('?enable=EXTRA_BOOMERANG,SHIELD')).toEqual([
      'SHIELD',
      'EXTRA_BOOMERANG',
    ]);
    // a retired power (Phase Dash, 2026-10-19) is simply unknown now
    expect(parseEnabledParam('?enable=PHASE_DASH,SHIELD')).toEqual(['SHIELD']);
    expect(parseEnabledParam('?enable=SHIELD,NOPE')).toEqual(['SHIELD']);
    for (const junk of ['', '?enable=', '?enable=NOPE', '?enabled=SHIELD']) {
      expect(parseEnabledParam(junk), junk).toBeUndefined();
    }
  });

  it('reaches the rules: a Book awards only an enabled power', () => {
    const runtime = new FuRuntime(PRIMITIVE_ARENA, 'fast', ['EXTRA_BOOMERANG']);
    runtime.start(players, 0);
    expect(runtime.state?.config.enabledPowers).toEqual(['EXTRA_BOOMERANG']);
  });
});
