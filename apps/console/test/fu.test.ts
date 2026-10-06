import { DEFAULT_FU_CONFIG, createFuMatch, stepFu, type FuState } from '@foomerang/foomerang-fu';
import type { RosterEntry } from '@foomerang/protocol';
import { describe, expect, it } from 'vitest';
import { buildFuView } from '../src/render/fuView';
import { FuRuntime } from '../src/runtime/fuRuntime';
import { SLOT_STYLES, SlotAllocator } from '../src/runtime/slots';

const FRAME = 1000 / 60;
const players = [
  { playerId: 'a', slot: 0 },
  { playerId: 'b', slot: 3 },
];
const press = (
  playerId: string,
  eventId: string,
  phase: 'pressed' | 'released' = 'pressed',
  action: 'PRIMARY' | 'SECONDARY' = 'SECONDARY', // Fu: SECONDARY is THROW, PRIMARY is SLASH
) => ({
  playerId,
  eventId,
  action,
  phase,
});
const roster = (overrides: Partial<RosterEntry>[] = []): RosterEntry[] => [
  { playerId: 'a', displayName: 'Alvin', connection: 'CONNECTED', seat: 'HELD', ...overrides[0] },
  { playerId: 'b', displayName: 'David', connection: 'CONNECTED', seat: 'HELD', ...overrides[1] },
];
function slotsFor(entries: RosterEntry[]): SlotAllocator {
  const slots = new SlotAllocator();
  slots.sync(entries.map((e) => ({ playerId: e.playerId, seated: e.seat === 'HELD' })));
  return slots;
}

/** Runs frames of 1/60 s from `from`, feeding fresh movement each frame; returns the end time. */
function run(
  runtime: FuRuntime,
  from: number,
  frames: number,
  move?: Record<string, [number, number]>,
): number {
  let now = from;
  for (let i = 0; i < frames; i += 1) {
    now += FRAME;
    for (const [id, [x, y]] of Object.entries(move ?? {})) runtime.receiveInput(id, x, y, now);
    runtime.frame(now);
  }
  return now;
}
const s = (r: FuRuntime): FuState => {
  if (!r.state) throw new Error('no match');
  return r.state;
};
const boom = (r: FuRuntime, id: string) => s(r).boomerangs.find((b) => b.ownerId === id);
const alive = (r: FuRuntime, id: string) => s(r).players.find((p) => p.id === id)?.alive;

describe('FuRuntime: platform input → Fu rules, one fixed step at a time', () => {
  it('does nothing, and claims nothing, before a match starts', () => {
    const runtime = new FuRuntime();
    runtime.frame(100);
    runtime.receiveAction(press('a', 'event-0001'));
    expect(runtime.state).toBeUndefined();
    expect(runtime.world).toBeUndefined();
    expect(runtime.view(roster(), slotsFor(roster()))).toBeUndefined();
    expect(runtime.metrics()).toMatchObject({ fps: undefined, simulationSteps: 0 });
  });

  it('starts round 1 of a Fu match for the given players, in their slots', () => {
    const runtime = new FuRuntime();
    runtime.start(players, 0);
    expect(s(runtime).round).toBe(1);
    expect(s(runtime).players.map((p) => [p.id, p.slot, p.alive])).toEqual([
      ['a', 0, true],
      ['b', 3, true],
    ]);
    expect(runtime.world).toBe(s(runtime).world);
  });

  it('moves only the player whose thumb moved, at the same speed whatever the frame rate', () => {
    for (const frameMs of [1000 / 60, 1000 / 30, 1000 / 144]) {
      const runtime = new FuRuntime();
      runtime.start(players, 0);
      const startX = runtime.world?.bodies[0]?.position.x ?? 0;
      let now = 0;
      while (now < 1000) {
        now += frameMs;
        runtime.receiveInput('a', 1, 0, now);
        runtime.frame(now);
      }
      const bodies = runtime.world?.bodies ?? [];
      expect(
        (bodies[0]?.position.x ?? 0) - startX,
        `${frameMs.toFixed(1)} ms frames`,
      ).toBeGreaterThan(DEFAULT_FU_CONFIG.playerSpeed * 0.95);
      expect(bodies[1]?.position).toEqual(
        createFuMatch([
          { id: 'a', slot: 0 },
          { id: 'b', slot: 3 },
        ]).world.bodies[1]?.position,
      );
    }
  });

  it('stale movement stops a player after 500 ms, without disconnecting them', () => {
    const runtime = new FuRuntime();
    runtime.start(players, 0);
    runtime.receiveInput('a', 1, 0, 0);
    const startX = runtime.world?.bodies[0]?.position.x ?? 0;
    run(runtime, 0, 120);
    const moved = (runtime.world?.bodies[0]?.position.x ?? 0) - startX;
    expect(moved).toBeGreaterThan(190);
    expect(moved).toBeLessThan(230);
    expect(runtime.metrics().staleNeutralizations).toBe(1);
  });

  it('a player who is reconnecting neither moves nor throws, and keeps everything else', () => {
    const runtime = new FuRuntime();
    runtime.start(players, 0);
    let active = false;
    runtime.setActivity(() => active);
    const before = runtime.world?.bodies[0]?.position;
    run(runtime, 0, 30, { a: [1, 0] });
    runtime.receiveAction(press('a', 'event-0001'));
    run(runtime, 500, 5);
    expect(runtime.world?.bodies[0]?.position).toEqual(before);
    expect(boom(runtime, 'a')?.state).toBe('HELD');
    active = true;
    run(runtime, 600, 5);
    expect(boom(runtime, 'a')?.state).toBe('HELD'); // the dropped press is not remembered and fired later
  });

  describe('throwing from a button', () => {
    it('a SECONDARY (THROW) press throws on the next step; a release does not', () => {
      const runtime = new FuRuntime();
      runtime.start(players, 0);
      runtime.receiveAction(press('a', 'event-0001', 'released'));
      run(runtime, 0, 2);
      expect(boom(runtime, 'a')?.state).toBe('HELD');
      runtime.receiveAction(press('a', 'event-0002'));
      run(runtime, 100, 1);
      expect(boom(runtime, 'a')?.state).toBe('THROWN');
    });

    it('ignores other actions, and presses from people who are not in the match', () => {
      const runtime = new FuRuntime();
      runtime.start(players, 0);
      runtime.receiveAction(
        press('a', 'event-0001', 'pressed', 'TERTIARY' as unknown as 'PRIMARY'), // an action Fu does not use
      );
      runtime.receiveAction(press('ghost', 'event-0002'));
      runtime.receiveAction(press('ghost', 'event-0002')); // not a player: not even worth remembering
      run(runtime, 0, 3);
      expect(runtime.duplicatesIgnored).toBe(0);
      expect(s(runtime).boomerangs.every((b) => b.state === 'HELD')).toBe(true);
    });

    it('a duplicate event id can never throw twice, even after the boomerang is back in hand', () => {
      const runtime = new FuRuntime();
      runtime.start(players, 0);
      let now = run(runtime, 0, 3, { a: [-1, 0] }); // turn to face left, away from Bob
      runtime.receiveAction(press('a', 'event-0001'));
      now = run(runtime, now, 150); // out, and back in hand (about 1.2 s)
      expect(boom(runtime, 'a')?.state).toBe('HELD');
      expect(alive(runtime, 'b')).toBe(true);
      runtime.receiveAction(press('a', 'event-0001')); // the very same event again
      now = run(runtime, now, 3);
      expect(boom(runtime, 'a')?.state).toBe('HELD');
      expect(runtime.duplicatesIgnored).toBe(1);
      runtime.receiveAction(press('a', 'event-0003')); // a NEW press does throw
      run(runtime, now, 2);
      expect(boom(runtime, 'a')?.state).toBe('THROWN');
    });

    it('a press made while active is dropped if the player becomes inactive before the step runs', () => {
      const runtime = new FuRuntime();
      runtime.start(players, 0);
      let active = true;
      runtime.setActivity(() => active);
      runtime.receiveAction(press('a', 'event-0001'));
      active = false; // the connection dropped between the press and the next step
      run(runtime, 0, 3);
      expect(boom(runtime, 'a')?.state).toBe('HELD');
    });

    it('two players pressing before the same step both throw', () => {
      const runtime = new FuRuntime();
      runtime.start(players, 0);
      runtime.receiveAction(press('a', 'event-0001'));
      runtime.receiveAction(press('b', 'event-0002'));
      run(runtime, 0, 1);
      expect(s(runtime).boomerangs.map((b) => b.state)).toEqual(['THROWN', 'THROWN']);
    });

    it('a new match forgets the old match’s event ids', () => {
      const runtime = new FuRuntime();
      runtime.start(players, 0);
      runtime.receiveAction(press('a', 'event-0001'));
      runtime.start(players, 1000);
      runtime.receiveAction(press('a', 'event-0001'));
      expect(runtime.duplicatesIgnored).toBe(0);
    });

    it('two presses before a step still make one throw', () => {
      const runtime = new FuRuntime();
      runtime.start(players, 0);
      runtime.receiveAction(press('a', 'event-0001'));
      runtime.receiveAction(press('a', 'event-0002'));
      const before = runtime.metrics().simulationSteps;
      run(runtime, 0, 1);
      expect(runtime.metrics().simulationSteps).toBeGreaterThan(before);
      expect(s(runtime).boomerangs.filter((b) => b.state === 'THROWN')).toHaveLength(1);
    });

    it('a throw requested during a stalled frame is applied exactly once, on the first step', () => {
      const runtime = new FuRuntime();
      runtime.start(players, 0);
      runtime.receiveAction(press('a', 'event-0001'));
      runtime.frame(2000); // a 2-second stall: 5 steps run, the rest discarded
      const b = boom(runtime, 'a');
      expect(b?.state).toBe('THROWN');
      // thrown on step 1 then flew 4 steps (not thrown again, not 5 throws)
      expect(b?.travelled).toBeCloseTo(DEFAULT_FU_CONFIG.throwSpeed * (1 / 60) * 4, 6);
    });

    it('a press while no step runs (time did not move) waits for the next step instead of vanishing', () => {
      const runtime = new FuRuntime();
      runtime.start(players, 0);
      runtime.receiveAction(press('a', 'event-0001'));
      runtime.frame(0); // no time passed: no step
      expect(boom(runtime, 'a')?.state).toBe('HELD');
      run(runtime, 0, 1);
      expect(boom(runtime, 'a')?.state).toBe('THROWN');
    });
  });

  describe('slashing from a button', () => {
    const slash = (playerId: string, eventId: string, phase: 'pressed' | 'released' = 'pressed') =>
      press(playerId, eventId, phase, 'PRIMARY');
    // Alice and Bob face each other down the middle; put Bob inside Alice's arc by walking him there.
    function closeUp(): { runtime: FuRuntime; now: number } {
      const runtime = new FuRuntime();
      runtime.start(players, 0);
      const spawnA = runtime.world?.bodies[0]?.position;
      const spawnB = runtime.world?.bodies[1]?.position;
      expect(spawnA && spawnB).toBeTruthy();
      return { runtime, now: 0 };
    }
    const slashState = (r: FuRuntime, id: string) => s(r).players.find((p) => p.id === id)?.slash;

    it('a PRIMARY press slashes on the next step; a release does not', () => {
      const { runtime } = closeUp();
      runtime.receiveAction(slash('a', 'event-0001', 'released'));
      run(runtime, 0, 2);
      expect(slashState(runtime, 'a')?.phase).toBe('READY');
      runtime.receiveAction(slash('a', 'event-0002'));
      run(runtime, 100, 1);
      expect(slashState(runtime, 'a')?.phase).toBe('ACTIVE');
      expect(boom(runtime, 'a')?.state).toBe('HELD'); // a slash is not a throw
    });

    it('delivers the swing to the renderer as a one-shot event', () => {
      const { runtime } = closeUp();
      const entries = roster();
      const slots = slotsFor(entries);
      runtime.receiveAction(slash('a', 'event-0001'));
      run(runtime, 0, 1);
      expect(runtime.view(entries, slots)?.events.map((e) => e.type)).toEqual(['SLASHED']);
      expect(runtime.view(entries, slots)?.events).toEqual([]);
    });

    it('a duplicate event id can never slash twice, even once the swing has fully recovered', () => {
      const { runtime } = closeUp();
      runtime.receiveAction(slash('a', 'event-0001'));
      let now = run(runtime, 0, 60); // the whole swing and its recovery
      expect(slashState(runtime, 'a')?.phase).toBe('READY');
      runtime.receiveAction(slash('a', 'event-0001')); // the very same event again
      now = run(runtime, now, 3);
      expect(slashState(runtime, 'a')?.phase).toBe('READY');
      expect(runtime.duplicatesIgnored).toBe(1);
      runtime.receiveAction(slash('a', 'event-0002')); // a NEW press does swing
      run(runtime, now, 1);
      expect(slashState(runtime, 'a')?.phase).toBe('ACTIVE');
    });

    it('a press made while active is dropped if the player becomes inactive before the step runs', () => {
      const { runtime } = closeUp();
      let active = true;
      runtime.setActivity(() => active);
      runtime.receiveAction(slash('a', 'event-0001'));
      active = false; // the connection dropped between the press and the next step
      run(runtime, 0, 3);
      active = true;
      run(runtime, 100, 3);
      expect(slashState(runtime, 'a')?.phase).toBe('READY'); // not remembered, not fired later
    });

    it('a controller coming back (reload / reconnect) manufactures no slash: nothing happens until it is pressed', () => {
      const { runtime } = closeUp();
      let active = true;
      runtime.setActivity(() => active);
      active = false;
      run(runtime, 0, 30);
      active = true; // the reconnect completes
      run(runtime, 500, 30);
      expect(slashState(runtime, 'a')?.phase).toBe('READY');
      expect(runtime.view(roster(), slotsFor(roster()))?.events).toEqual([]);
    });

    it('THROW and SLASH reaching the console before the same step: the slash wins, in either arrival order', () => {
      for (const order of ['slash-first', 'throw-first'] as const) {
        const { runtime } = closeUp();
        const sl = slash('a', 'event-0001');
        const th = press('a', 'event-0002');
        for (const action of order === 'slash-first' ? [sl, th] : [th, sl])
          runtime.receiveAction(action);
        run(runtime, 0, 1);
        expect(slashState(runtime, 'a')?.phase, order).toBe('ACTIVE');
        expect(boom(runtime, 'a')?.state, order).toBe('HELD');
      }
    });

    it('a slash and a throw from different players before one step both happen', () => {
      const { runtime } = closeUp();
      runtime.receiveAction(slash('a', 'event-0001'));
      runtime.receiveAction(press('b', 'event-0002'));
      run(runtime, 0, 1);
      expect(slashState(runtime, 'a')?.phase).toBe('ACTIVE');
      expect(boom(runtime, 'b')?.state).toBe('THROWN');
    });

    it('a slash killing someone ends the round through the real step loop', () => {
      const runtime = new FuRuntime();
      runtime.start(players, 0);
      // Alice (top) walks down towards Bob (bottom), then slashes when close.
      let now = 0;
      for (let i = 0; i < 400 && alive(runtime, 'b'); i += 1) {
        const close = Math.hypot(
          (runtime.world?.bodies[0]?.position.x ?? 0) - (runtime.world?.bodies[1]?.position.x ?? 0),
          (runtime.world?.bodies[0]?.position.y ?? 0) - (runtime.world?.bodies[1]?.position.y ?? 0),
        );
        if (close < DEFAULT_FU_CONFIG.slashReach - 20)
          runtime.receiveAction(slash('a', `event-${i}`));
        now = run(runtime, now, 1, { a: [0, 1] });
      }
      expect(alive(runtime, 'b')).toBe(false);
      expect(s(runtime).roundOver?.winnerId).toBe('a');
    });
  });

  describe('a round, end to end', () => {
    function fight(): { runtime: FuRuntime; now: number } {
      const runtime = new FuRuntime();
      runtime.start(players, 0);
      // Put both players on one horizontal line, a facing b, by driving them there with real input.
      return { runtime, now: 0 };
    }

    it('a thrown boomerang kills, the round ends, and a new round starts after the interval', () => {
      const { runtime } = fight();
      // slot 0 is at the top centre, slot 3 at the bottom centre; a throws straight down the middle.
      runtime.receiveAction(press('a', 'event-0001'));
      let now = run(runtime, 0, 60);
      expect(alive(runtime, 'b')).toBe(false);
      expect(s(runtime).phase).toBe('ROUND_OVER');
      expect(s(runtime).roundOver?.winnerId).toBe('a');
      now = run(runtime, now, 200);
      expect(s(runtime).round).toBe(2);
      expect(s(runtime).phase).toBe('PLAYING');
      expect(alive(runtime, 'b')).toBe(true);
      expect(now).toBeGreaterThan(0);
    });

    it('delivers one-shot presentation events once, with the first view after they happen', () => {
      const { runtime } = fight();
      const entries = roster();
      const slots = slotsFor(entries);
      runtime.receiveAction(press('a', 'event-0001'));
      run(runtime, 0, 1);
      const first = runtime.view(entries, slots);
      expect(first?.events.map((e) => e.type)).toEqual(['THROWN']);
      expect(runtime.view(entries, slots)?.events).toEqual([]); // not again
    });

    it('a new match starts clean: round 1, nothing in flight, counters at zero', () => {
      const { runtime } = fight();
      runtime.receiveAction(press('a', 'event-0001'));
      run(runtime, 0, 60);
      runtime.start(players, 5000);
      expect(s(runtime).round).toBe(1);
      expect(s(runtime).boomerangs.every((b) => b.state === 'HELD')).toBe(true);
      expect(runtime.metrics().simulationSteps).toBe(0);
      expect(runtime.duplicatesIgnored).toBe(0);
    });
  });

  it('is the same fixed-step machine as the arena: five catch-up steps, the rest discarded and counted', () => {
    const runtime = new FuRuntime();
    runtime.start(players, 0);
    runtime.frame(2000);
    expect(runtime.metrics()).toMatchObject({
      simulationSteps: 5,
      catchUpFrames: 1,
      discardEvents: 1,
    });
    expect(runtime.metrics().discardedSimulationMs).toBeGreaterThan(1500);
  });

  it('reports a read-only debug snapshot of the Fu state', () => {
    const runtime = new FuRuntime();
    runtime.start(players, 0);
    expect(runtime.debugState()).toMatchObject({ round: 1, phase: 'PLAYING' });
    expect(() => JSON.stringify(runtime.debugState())).not.toThrow();
  });
});

describe('buildFuView: Fu state → what Phaser draws', () => {
  function playing(): { state: FuState; entries: RosterEntry[]; slots: SlotAllocator } {
    const entries = roster();
    return {
      state: createFuMatch([
        { id: 'a', slot: 0 },
        { id: 'b', slot: 3 },
      ]),
      entries,
      slots: slotsFor(entries),
    };
  }

  it('draws each player with name, number, shape, colour, facing and whether their boomerang is in hand', () => {
    const { state, entries, slots } = playing();
    const view = buildFuView(state, [], entries, slots);
    expect(view.circles[0]).toMatchObject({
      id: 'a',
      label: 'Alvin',
      number: 1,
      color: SLOT_STYLES[0]?.color,
      dead: false,
      armed: true,
      facing: state.players[0]?.facing,
    });
    expect(view.circles[1]).toMatchObject({ id: 'b', shape: 'square', dead: false, armed: true });
    expect(view.round).toBe(1);
    expect(view.banner).toBeUndefined();
    expect(view.boomerangs).toEqual([]); // nothing in flight
  });

  it('draws a boomerang only while it is in the air, in its owner’s colour, and disarms its owner', () => {
    const { state, entries, slots } = playing();
    const thrown = stepFu(state, new Map([['a', { throw: true }]]), 1 / 60).state;
    const view = buildFuView(thrown, [], entries, slots);
    expect(view.boomerangs).toEqual([
      expect.objectContaining({
        ownerId: 'a',
        state: 'THROWN',
        color: SLOT_STYLES[0]?.color,
        radius: DEFAULT_FU_CONFIG.boomerangRadius,
      }),
    ]);
    expect(view.circles[0]?.armed).toBe(false);
    expect(view.circles[1]?.armed).toBe(true);
  });

  it('shows the dead as dead and dimmed — separately from any visual effect', () => {
    const { state, entries, slots } = playing();
    const dead: FuState = {
      ...state,
      players: state.players.map((p) => (p.id === 'b' ? { ...p, alive: false } : p)),
    };
    const view = buildFuView(dead, [], entries, slots);
    expect(view.circles[1]).toMatchObject({ dead: true, dimmed: true, armed: false });
    expect(view.circles[0]).toMatchObject({ dead: false, dimmed: false });
  });

  it('announces the winner, or a draw, while the round is over', () => {
    const { state, entries, slots } = playing();
    const won: FuState = {
      ...state,
      phase: 'ROUND_OVER',
      roundOver: { winnerId: 'a', resetInSeconds: 2 },
    };
    expect(buildFuView(won, [], entries, slots).banner).toBe('Alvin wins the round');
    const draw: FuState = {
      ...state,
      phase: 'ROUND_OVER',
      roundOver: { winnerId: undefined, resetInSeconds: 2 },
    };
    expect(buildFuView(draw, [], entries, slots).banner).toBe('Draw');
  });

  it('turns rules events into drawable events, placed and coloured', () => {
    const { state, entries, slots } = playing();
    const view = buildFuView(
      state,
      [
        { type: 'THROWN', playerId: 'a', position: { x: 10, y: 20 }, direction: { x: 1, y: 0 } },
        { type: 'HIT', byId: 'a', victimId: 'b', position: { x: 30, y: 40 } },
        { type: 'CAUGHT', playerId: 'a' },
        { type: 'ROUND_START', round: 2 },
        { type: 'ROUND_OVER', winnerId: 'a' },
      ],
      entries,
      slots,
    );
    expect(view.events.map((e) => e.type)).toEqual(['THROWN', 'HIT', 'CAUGHT', 'ROUND_START']);
    expect(view.events[0]).toMatchObject({ x: 10, y: 20, color: SLOT_STYLES[0]?.color });
    expect(view.events[1]).toMatchObject({ x: 30, y: 40, color: SLOT_STYLES[1]?.color }); // the victim's colour
    expect(view.events[2]).toMatchObject({ color: SLOT_STYLES[0]?.color });
  });

  it('hands the renderer everything it needs to draw a swing, so it never decides what was hit', () => {
    const { state, entries, slots } = playing();
    const view = buildFuView(
      state,
      [
        {
          type: 'SLASHED',
          playerId: 'a',
          position: { x: 50, y: 60 },
          direction: { x: 0, y: 1 },
        },
      ],
      entries,
      slots,
    );
    expect(view.events).toEqual([
      {
        type: 'SLASHED',
        x: 50,
        y: 60,
        color: SLOT_STYLES[0]?.color,
        swing: {
          direction: { x: 0, y: 1 },
          reach: DEFAULT_FU_CONFIG.slashReach,
          arc: DEFAULT_FU_CONFIG.slashArc,
          seconds: DEFAULT_FU_CONFIG.slashActiveSeconds + DEFAULT_FU_CONFIG.slashRecoverySeconds,
        },
      },
    ]);
  });

  it('marks flying boomerangs as spent once the round is over (no live projectile sits frozen on the victim)', () => {
    const { state, entries, slots } = playing();
    const thrown = stepFu(state, new Map([['a', { throw: true }]]), 1 / 60).state;
    expect(buildFuView(thrown, [], entries, slots).boomerangs.map((b) => b.spent)).toEqual([false]);
    const over: FuState = {
      ...thrown,
      phase: 'ROUND_OVER',
      roundOver: { winnerId: 'a', resetInSeconds: 2 },
    };
    expect(buildFuView(over, [], entries, slots).boomerangs.map((b) => b.spent)).toEqual([true]);
  });

  it('a reconnecting player stays visible (same colour/number) but is dimmed', () => {
    const { state, slots } = playing();
    const view = buildFuView(state, [], roster([{ connection: 'RECONNECTING' }]), slots);
    expect(view.circles[0]).toMatchObject({
      number: 1,
      status: 'RECONNECTING',
      dimmed: true,
      dead: false,
    });
  });

  it('is pure: the same inputs give the same view', () => {
    const { state, entries, slots } = playing();
    expect(buildFuView(state, [], entries, slots)).toEqual(buildFuView(state, [], entries, slots));
  });
});
