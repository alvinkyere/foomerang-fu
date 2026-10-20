import {
  DEFAULT_FU_CONFIG,
  FU_CONTROLS,
  PRIMITIVE_ARENA,
  createFuMatch,
  stepFu,
  type FuState,
} from '@foomerang/foomerang-fu';
import type { RosterEntry } from '@foomerang/protocol';
import { describe, expect, it } from 'vitest';
import { buildFuView } from '../src/render/fuView';
import { FuRuntime } from '../src/runtime/fuRuntime';
import { SLOT_STYLES, SlotAllocator } from '../src/runtime/slots';

const FRAME = 1000 / 60;
/** The runtime's mechanics (input, dedup, rounds) are tested in the open Slice 1 arena; the primitive arena has its own tests. */
const OPEN = DEFAULT_FU_CONFIG.arena;
const players = [
  { playerId: 'a', slot: 0 },
  { playerId: 'b', slot: 3 },
];
const press = (
  playerId: string,
  eventId: string,
  phase: 'pressed' | 'released' = 'pressed',
  action: 'PRIMARY' | 'SECONDARY' | 'TERTIARY' = 'SECONDARY', // Fu: SECONDARY is THROW, PRIMARY is SLASH, TERTIARY is DASH
) => ({
  playerId,
  eventId,
  action,
  phase,
});
/** THROW pressed and let go before a step runs: a tap, a plain throw (holding it down charges; owner, 2026-10-19). */
const tapThrow = (
  runtime: { receiveAction(a: ReturnType<typeof press>): void },
  playerId: string,
  eventId: string,
) => {
  runtime.receiveAction(press(playerId, eventId));
  runtime.receiveAction(press(playerId, `${eventId}-up`, 'released'));
};
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
    const runtime = new FuRuntime(OPEN);
    runtime.frame(100);
    tapThrow(runtime, 'a', 'event-0001');
    expect(runtime.state).toBeUndefined();
    expect(runtime.world).toBeUndefined();
    expect(runtime.view(roster(), slotsFor(roster()))).toBeUndefined();
    expect(runtime.metrics()).toMatchObject({ fps: undefined, simulationSteps: 0 });
  });

  it('starts round 1 of a Fu match for the given players, in their slots', () => {
    const runtime = new FuRuntime(OPEN);
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
      const runtime = new FuRuntime(OPEN);
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
    const runtime = new FuRuntime(OPEN);
    runtime.start(players, 0);
    runtime.receiveInput('a', 1, 0, 0);
    const startX = runtime.world?.bodies[0]?.position.x ?? 0;
    run(runtime, 0, 120);
    const moved = (runtime.world?.bodies[0]?.position.x ?? 0) - startX;
    // 500 ms of walking at the player speed, then nothing (give or take the step it notices)
    const halfSecond = DEFAULT_FU_CONFIG.playerSpeed * 0.5;
    expect(moved).toBeGreaterThan(halfSecond - 20);
    expect(moved).toBeLessThan(halfSecond + 20);
    expect(runtime.metrics().staleNeutralizations).toBe(1);
  });

  it('a player who is reconnecting neither moves nor throws, and keeps everything else', () => {
    const runtime = new FuRuntime(OPEN);
    runtime.start(players, 0);
    let active = false;
    runtime.setActivity(() => active);
    const before = runtime.world?.bodies[0]?.position;
    run(runtime, 0, 30, { a: [1, 0] });
    tapThrow(runtime, 'a', 'event-0001');
    run(runtime, 500, 5);
    expect(runtime.world?.bodies[0]?.position).toEqual(before);
    expect(boom(runtime, 'a')?.state).toBe('HELD');
    active = true;
    run(runtime, 600, 5);
    expect(boom(runtime, 'a')?.state).toBe('HELD'); // the dropped press is not remembered and fired later
  });

  describe('throwing from a button', () => {
    it('a SECONDARY (THROW) press throws on the next step; a release does not', () => {
      const runtime = new FuRuntime(OPEN);
      runtime.start(players, 0);
      runtime.receiveAction(press('a', 'event-0001', 'released'));
      run(runtime, 0, 2);
      expect(boom(runtime, 'a')?.state).toBe('HELD');
      tapThrow(runtime, 'a', 'event-0002');
      run(runtime, 100, 1);
      expect(boom(runtime, 'a')?.state).toBe('THROWN');
    });

    it('ignores other actions, and presses from people who are not in the match', () => {
      const runtime = new FuRuntime(OPEN);
      runtime.start(players, 0);
      runtime.receiveAction(
        press('a', 'event-0001', 'pressed', 'QUATERNARY' as unknown as 'PRIMARY'), // an action nobody uses
      );
      tapThrow(runtime, 'ghost', 'event-0002');
      tapThrow(runtime, 'ghost', 'event-0002'); // not a player: not even worth remembering
      run(runtime, 0, 3);
      expect(runtime.duplicatesIgnored).toBe(0);
      expect(s(runtime).boomerangs.every((b) => b.state === 'HELD')).toBe(true);
    });

    it('a duplicate event id can never throw twice, even after the boomerang is back in hand', () => {
      const runtime = new FuRuntime(OPEN);
      runtime.start(players, 0);
      let now = run(runtime, 0, 3, { a: [-1, 0] }); // turn to face left, away from Bob
      tapThrow(runtime, 'a', 'event-0001');
      now = run(runtime, now, 150); // out, and back in hand (about 1.2 s)
      expect(boom(runtime, 'a')?.state).toBe('HELD');
      expect(alive(runtime, 'b')).toBe(true);
      tapThrow(runtime, 'a', 'event-0001'); // the very same events again (its press and its release)
      now = run(runtime, now, 3);
      expect(boom(runtime, 'a')?.state).toBe('HELD');
      expect(runtime.duplicatesIgnored).toBe(2);
      tapThrow(runtime, 'a', 'event-0003'); // a NEW press does throw
      run(runtime, now, 2);
      expect(boom(runtime, 'a')?.state).toBe('THROWN');
    });

    it('a press made while active is dropped if the player becomes inactive before the step runs', () => {
      const runtime = new FuRuntime(OPEN);
      runtime.start(players, 0);
      let active = true;
      runtime.setActivity(() => active);
      tapThrow(runtime, 'a', 'event-0001');
      active = false; // the connection dropped between the press and the next step
      run(runtime, 0, 3);
      expect(boom(runtime, 'a')?.state).toBe('HELD');
    });

    it('two players pressing before the same step both throw', () => {
      const runtime = new FuRuntime(OPEN);
      runtime.start(players, 0);
      tapThrow(runtime, 'a', 'event-0001');
      tapThrow(runtime, 'b', 'event-0002');
      run(runtime, 0, 1);
      expect(s(runtime).boomerangs.map((b) => b.state)).toEqual(['THROWN', 'THROWN']);
    });

    it('a new match forgets the old match’s event ids', () => {
      const runtime = new FuRuntime(OPEN);
      runtime.start(players, 0);
      tapThrow(runtime, 'a', 'event-0001');
      runtime.start(players, 1000);
      tapThrow(runtime, 'a', 'event-0001');
      expect(runtime.duplicatesIgnored).toBe(0);
    });

    it('two presses before a step still make one throw', () => {
      const runtime = new FuRuntime(OPEN);
      runtime.start(players, 0);
      tapThrow(runtime, 'a', 'event-0001');
      tapThrow(runtime, 'a', 'event-0002');
      const before = runtime.metrics().simulationSteps;
      run(runtime, 0, 1);
      expect(runtime.metrics().simulationSteps).toBeGreaterThan(before);
      expect(s(runtime).boomerangs.filter((b) => b.state === 'THROWN')).toHaveLength(1);
    });

    it('a throw requested during a stalled frame is applied exactly once, on the first step', () => {
      const runtime = new FuRuntime(OPEN);
      runtime.start(players, 0);
      tapThrow(runtime, 'a', 'event-0001');
      runtime.frame(2000); // a 2-second stall: 5 steps run, the rest discarded
      const b = boom(runtime, 'a');
      expect(b?.state).toBe('THROWN');
      // thrown on step 1 then flew 4 steps (not thrown again, not 5 throws)
      expect(b?.travelled).toBeCloseTo(DEFAULT_FU_CONFIG.throwSpeed * (1 / 60) * 4, 6);
    });

    it('a press while no step runs (time did not move) waits for the next step instead of vanishing', () => {
      const runtime = new FuRuntime(OPEN);
      runtime.start(players, 0);
      tapThrow(runtime, 'a', 'event-0001');
      runtime.frame(0); // no time passed: no step
      expect(boom(runtime, 'a')?.state).toBe('HELD');
      run(runtime, 0, 1);
      expect(boom(runtime, 'a')?.state).toBe('THROWN');
    });
  });

  describe('what each ADVERTISED button does (the regression for THROW arriving as SLASH)', () => {
    // Driven from the very table the server advertises, so a button and its meaning cannot drift apart.
    const buttons = FU_CONTROLS.flatMap((c) => (c.type === 'button' ? [c] : []));
    const effect = (runtime: FuRuntime, id: string) => {
      const me = s(runtime).players.find((p) => p.id === id);
      return {
        swung: me?.slash.phase !== 'READY',
        thrown: boom(runtime, id)?.state !== 'HELD',
        dashed: me?.dash.phase !== 'READY',
      };
    };

    it.each([
      ['SLASH', { swung: true, thrown: false, dashed: false }],
      ['THROW', { swung: false, thrown: true, dashed: false }],
      ['DASH', { swung: false, thrown: false, dashed: true }],
    ] as const)('pressing the %s control does that, and not the other', (label, expected) => {
      const control = buttons.find((c) => c.id === label);
      expect(control, `${label} is advertised`).toBeDefined();
      const runtime = new FuRuntime(OPEN);
      runtime.start(players, 0);
      // a phone sends a press and a release (THROW acts on the release: holding it charges)
      runtime.receiveAction(press('a', 'event-0001', 'pressed', control?.action ?? 'PRIMARY'));
      runtime.receiveAction(press('a', 'event-0001-up', 'released', control?.action ?? 'PRIMARY'));
      run(runtime, 0, 2);
      expect(effect(runtime, 'a')).toEqual(expected);
      expect(effect(runtime, 'b')).toEqual({ swung: false, thrown: false, dashed: false }); // nobody else did anything
    });

    it('every advertised button does something, and no two buttons do the same thing', () => {
      const seen = new Set<string>();
      for (const control of buttons) {
        const runtime = new FuRuntime(OPEN);
        runtime.start(players, 0);
        runtime.receiveAction(press('a', 'event-0001', 'pressed', control.action));
        runtime.receiveAction(press('a', 'event-0001-up', 'released', control.action));
        run(runtime, 0, 2);
        const e = effect(runtime, 'a');
        expect(e.swung || e.thrown || e.dashed, control.id).toBe(true);
        seen.add(JSON.stringify(e));
      }
      expect(seen.size).toBe(buttons.length);
    });
  });

  describe('slashing from a button', () => {
    const slash = (playerId: string, eventId: string, phase: 'pressed' | 'released' = 'pressed') =>
      press(playerId, eventId, phase, 'PRIMARY');
    // Alice and Bob face each other down the middle; put Bob inside Alice's arc by walking him there.
    function closeUp(): { runtime: FuRuntime; now: number } {
      const runtime = new FuRuntime(OPEN);
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
      tapThrow(runtime, 'b', 'event-0002');
      run(runtime, 0, 1);
      expect(slashState(runtime, 'a')?.phase).toBe('ACTIVE');
      expect(boom(runtime, 'b')?.state).toBe('THROWN');
    });

    it('a slash killing someone ends the round through the real step loop', () => {
      const runtime = new FuRuntime(OPEN);
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

  describe('dashing from a button (Slice 4)', () => {
    const dash = (playerId: string, eventId: string, phase: 'pressed' | 'released' = 'pressed') =>
      press(playerId, eventId, phase, 'TERTIARY');
    const dashOf = (r: FuRuntime, id: string) => s(r).players.find((p) => p.id === id)?.dash;
    const at = (r: FuRuntime, id: string) => s(r).world.bodies.find((b) => b.id === id)?.position;
    const started = (): FuRuntime => {
      const runtime = new FuRuntime(OPEN);
      runtime.start(players, 0);
      return runtime;
    };

    it('a TERTIARY press dashes on the next step; a release does not', () => {
      const runtime = started();
      runtime.receiveAction(dash('a', 'event-0001', 'released'));
      run(runtime, 0, 2);
      expect(dashOf(runtime, 'a')?.phase).toBe('READY');
      runtime.receiveAction(dash('a', 'event-0002'));
      run(runtime, 100, 1);
      expect(dashOf(runtime, 'a')?.phase).toBe('DASHING');
      expect(dashOf(runtime, 'b')?.phase).toBe('READY'); // nobody else did
    });

    it('dashes the way the thumb is pointing when the press arrives, and the way the player faces otherwise', () => {
      const withThumb = started();
      const before = at(withThumb, 'a');
      withThumb.receiveInput('a', 0, 1, 10);
      withThumb.receiveAction(dash('a', 'event-0001'));
      withThumb.frame(10 + FRAME);
      expect(dashOf(withThumb, 'a')).toMatchObject({ phase: 'DASHING', direction: { x: 0, y: 1 } });
      expect(at(withThumb, 'a')?.x).toBeCloseTo(before?.x ?? 0, 9);

      const bare = started();
      const facing = s(bare).players[0]?.facing;
      bare.receiveAction(dash('a', 'event-0001'));
      run(bare, 0, 1);
      expect(dashOf(bare, 'a')).toMatchObject({ phase: 'DASHING', direction: facing });
    });

    it('moves a whole dash distance through the real loop, once, however long the finger stays down', () => {
      const runtime = started();
      const before = at(runtime, 'a');
      runtime.receiveAction(dash('a', 'event-0001'));
      run(runtime, 0, 12);
      const after = at(runtime, 'a');
      const facing = s(runtime).players[0]?.facing ?? { x: 0, y: 0 };
      const distance = DEFAULT_FU_CONFIG.dashSpeed * DEFAULT_FU_CONFIG.dashSeconds;
      expect((after?.x ?? 0) - (before?.x ?? 0)).toBeCloseTo(facing.x * distance, 4);
      expect((after?.y ?? 0) - (before?.y ?? 0)).toBeCloseTo(facing.y * distance, 4);
    });

    it('a duplicate event id can never dash twice, even long after the first dash is over', () => {
      const runtime = started();
      runtime.receiveAction(dash('a', 'event-0001'));
      run(runtime, 0, 200); // the dash is long over
      expect(dashOf(runtime, 'a')?.phase).toBe('READY');
      expect(s(runtime).players[0]?.fatigue.dashes).toBe(1);
      runtime.receiveAction(dash('a', 'event-0001'));
      run(runtime, 4000, 3);
      expect(dashOf(runtime, 'a')?.phase).toBe('READY');
      expect(s(runtime).players[0]?.fatigue.dashes).toBe(1); // a duplicate adds no fatigue
      expect(runtime.duplicatesIgnored).toBe(1);
    });

    describe('fatigue is counted by the rules, from successful dashes only', () => {
      const fatigueOf = (r: FuRuntime, id = 'a') => s(r).players.find((p) => p.id === id)?.fatigue;

      it('the 9th successful dash makes the player FATIGUED; dashing keeps working after that', () => {
        const runtime = started();
        let now = 0;
        for (let n = 1; n <= 12; n += 1) {
          runtime.receiveAction(dash('a', `event-${1000 + n}`));
          now = run(runtime, now, 12); // the dash, then a couple of idle steps
          expect(fatigueOf(runtime)?.dashes, `after press ${n}`).toBe(n);
          const view = runtime.view(roster(), slotsFor(roster()));
          expect(view?.circles[0]?.fatigued === true, `after press ${n}`).toBe(n >= 9);
        }
      });

      it('duplicates, presses during a dash and releases add nothing', () => {
        const runtime = started();
        runtime.receiveAction(dash('a', 'event-0001'));
        runtime.receiveAction(dash('a', 'event-0001')); // duplicate id
        runtime.receiveAction(dash('a', 'event-0002', 'released')); // a release
        let now = run(runtime, 0, 2);
        runtime.receiveAction(dash('a', 'event-0003')); // arrives mid-dash: refused by the rules
        now = run(runtime, now, 1);
        expect(dashOf(runtime, 'a')?.phase).toBe('DASHING');
        now = run(runtime, now, 20);
        expect(fatigueOf(runtime)?.dashes).toBe(1);
        expect(runtime.duplicatesIgnored).toBe(1);
        expect(now).toBeGreaterThan(0);
      });

      it('a press dropped because the player is reconnecting adds nothing', () => {
        const runtime = started();
        runtime.setActivity(() => false);
        runtime.receiveAction(dash('a', 'event-0001'));
        run(runtime, 0, 5);
        expect(fatigueOf(runtime)).toEqual({ dashes: 0, recoverIn: 0 });
      });

      it('reports the fatigue in the read-only debug snapshot', () => {
        const runtime = started();
        runtime.receiveAction(dash('a', 'event-0001'));
        run(runtime, 0, 2);
        const players = (
          runtime.debugState() as {
            players: { fatigue: { dashes: number; recoverIn: number; fatigued: boolean } }[];
          }
        ).players;
        expect(players[0]?.fatigue).toMatchObject({ dashes: 1, fatigued: false });
        expect(players[1]?.fatigue).toEqual({ dashes: 0, recoverIn: 0, fatigued: false });
      });
    });

    it('a press made while active is dropped if the player becomes inactive before the step runs', () => {
      const runtime = started();
      let active = true;
      runtime.setActivity(() => active);
      runtime.receiveAction(dash('a', 'event-0001'));
      active = false;
      run(runtime, 0, 3);
      active = true;
      run(runtime, 500, 3);
      expect(dashOf(runtime, 'a')?.phase).toBe('READY'); // not remembered and fired later
    });

    it('a player who is reconnecting cannot dash (the press is dropped, never remembered)', () => {
      const runtime = started();
      runtime.setActivity(() => false);
      runtime.receiveAction(dash('a', 'event-0001'));
      run(runtime, 0, 3);
      runtime.setActivity(() => true);
      run(runtime, 500, 3);
      expect(dashOf(runtime, 'a')?.phase).toBe('READY');
    });

    it('a controller coming back (reload / reconnect) manufactures no dash', () => {
      const runtime = started();
      run(runtime, 0, 30);
      expect(dashOf(runtime, 'a')?.phase).toBe('READY');
    });

    it('SLASH, THROW and DASH all reaching the console before one step: the rules choose — slash, then throw, then dash — never the arrival order', () => {
      const presses = [
        press('a', 'event-0001', 'pressed', 'PRIMARY'),
        press('a', 'event-0002', 'pressed', 'SECONDARY'),
        dash('a', 'event-0003'),
      ];
      for (const order of [presses, [...presses].reverse(), [presses[1], presses[2], presses[0]]]) {
        const runtime = started();
        for (const action of order) if (action) runtime.receiveAction(action);
        run(runtime, 0, 1);
        const me = s(runtime).players[0];
        expect(me?.slash.phase).toBe('ACTIVE');
        expect(boom(runtime, 'a')?.state).toBe('HELD');
        expect(me?.dash.phase).toBe('READY');
      }
    });

    it('THROW and DASH together: the throw wins, whichever arrived first', () => {
      for (const order of ['throw-first', 'dash-first'] as const) {
        const runtime = started();
        const th = [press('a', 'event-0001'), press('a', 'event-0001-up', 'released')]; // a tap
        const da = dash('a', 'event-0002');
        for (const action of order === 'throw-first' ? [...th, da] : [da, ...th])
          runtime.receiveAction(action);
        run(runtime, 0, 1);
        expect(boom(runtime, 'a')?.state, order).toBe('THROWN');
        expect(dashOf(runtime, 'a')?.phase, order).toBe('READY');
      }
    });

    it('a dash and a slash from different players before one step both happen', () => {
      const runtime = started();
      runtime.receiveAction(dash('a', 'event-0001'));
      runtime.receiveAction(press('b', 'event-0002', 'pressed', 'PRIMARY'));
      run(runtime, 0, 1);
      expect(dashOf(runtime, 'a')?.phase).toBe('DASHING');
      expect(s(runtime).players[1]?.slash.phase).toBe('ACTIVE');
    });

    it('delivers a one-shot DASHED event to the renderer, once', () => {
      const runtime = started();
      runtime.receiveAction(dash('a', 'event-0001'));
      run(runtime, 0, 3);
      const first = runtime.view(roster(), slotsFor(roster()));
      expect(first?.events.filter((e) => e.type === 'DASHED')).toHaveLength(1);
      expect(runtime.view(roster(), slotsFor(roster()))?.events).toEqual([]);
    });

    it('shows the player as dashing only while the burst lasts', () => {
      const runtime = started();
      runtime.receiveAction(dash('a', 'event-0001'));
      let now = run(runtime, 0, 2);
      const mid = runtime.view(roster(), slotsFor(roster()));
      expect(mid?.circles[0]?.dashing).toBeDefined();
      expect(mid?.circles[1]?.dashing).toBeUndefined();
      now = run(runtime, now, 20);
      expect(runtime.view(roster(), slotsFor(roster()))?.circles[0]?.dashing).toBeUndefined();
      expect(now).toBeGreaterThan(0);
    });

    it('reports the dash in the read-only debug snapshot', () => {
      const runtime = started();
      runtime.receiveAction(dash('a', 'event-0001'));
      run(runtime, 0, 2);
      const players = (runtime.debugState() as { players: { id: string; dash: string }[] }).players;
      expect(players.map((p) => [p.id, p.dash])).toEqual([
        ['a', 'DASHING'],
        ['b', 'READY'],
      ]);
    });
  });

  describe('a round, end to end', () => {
    function fight(): { runtime: FuRuntime; now: number } {
      const runtime = new FuRuntime(OPEN);
      runtime.start(players, 0);
      // Put both players on one horizontal line, a facing b, by driving them there with real input.
      return { runtime, now: 0 };
    }

    it('a thrown boomerang kills, the round ends, the scoreboard waits, and CONTINUE starts the next round', () => {
      const { runtime } = fight();
      // slot 0 is at the top centre, slot 3 at the bottom centre; a throws straight down the middle: a full charge (a quick
      // throw curves; owner, 2026-10-19), held for 0.7 s and let go
      runtime.receiveAction(press('a', 'event-0001'));
      let now = run(runtime, 0, 42);
      runtime.receiveAction(press('a', 'event-0002', 'released'));
      now = run(runtime, now, 60);
      expect(alive(runtime, 'b')).toBe(false);
      expect(s(runtime).phase).toBe('ROUND_OVER');
      expect(s(runtime).roundOver?.winnerId).toBe('a');
      expect(runtime.matchPhase()).toBe('ROUND_OVER'); // the end beat
      now = run(runtime, now, 200);
      // the scoreboard (owner, 2026-10-19): it waits, however long, until somebody continues
      expect(runtime.matchPhase()).toBe('SCOREBOARD');
      now = run(runtime, now, 600);
      expect(s(runtime).round).toBe(1);
      runtime.continueRound();
      now = run(runtime, now, 1);
      expect(s(runtime).round).toBe(2);
      expect(s(runtime).phase).toBe('PLAYING');
      expect(runtime.matchPhase()).toBe('PLAYING');
      expect(alive(runtime, 'b')).toBe(true);
      expect(now).toBeGreaterThan(0);
    });

    it('delivers one-shot presentation events once, with the first view after they happen', () => {
      const { runtime } = fight();
      const entries = roster();
      const slots = slotsFor(entries);
      tapThrow(runtime, 'a', 'event-0001');
      run(runtime, 0, 1);
      const first = runtime.view(entries, slots);
      expect(first?.events.map((e) => e.type)).toEqual(['THROWN']);
      expect(runtime.view(entries, slots)?.events).toEqual([]); // not again
    });

    it('a new match starts clean: round 1, nothing in flight, counters at zero', () => {
      const { runtime } = fight();
      tapThrow(runtime, 'a', 'event-0001');
      run(runtime, 0, 60);
      runtime.start(players, 5000);
      expect(s(runtime).round).toBe(1);
      expect(s(runtime).boomerangs.every((b) => b.state === 'HELD')).toBe(true);
      expect(runtime.metrics().simulationSteps).toBe(0);
      expect(runtime.duplicatesIgnored).toBe(0);
    });
  });

  it('is the same fixed-step machine as the arena: five catch-up steps, the rest discarded and counted', () => {
    const runtime = new FuRuntime(OPEN);
    runtime.start(players, 0);
    runtime.frame(2000);
    expect(runtime.metrics()).toMatchObject({
      simulationSteps: 5,
      catchUpFrames: 1,
      discardEvents: 1,
    });
    expect(runtime.metrics().discardedSimulationMs).toBeGreaterThan(1500);
  });

  it('plays in the primitive arena: its walls, and its own spawn points', () => {
    const runtime = new FuRuntime();
    runtime.start(players, 0);
    expect(s(runtime).config.arena).toBe(PRIMITIVE_ARENA);
    expect(s(runtime).world.bodies.map((b) => b.position)).toEqual([
      PRIMITIVE_ARENA.spawns?.[0],
      PRIMITIVE_ARENA.spawns?.[3], // the second test player holds slot 3
    ]);
  });

  it('a player walking into the arena’s wall is stopped by it (rules-owned geometry, through the real runtime)', () => {
    const runtime = new FuRuntime();
    runtime.start(players, 0);
    // slot 0 starts top-left at (110, 110); the left corridor's wall (200–250, 300–600) is below and to the right.
    runtime.receiveAction(press('a', 'event-0001', 'pressed', 'SECONDARY')); // (a throw: nothing to do with it)
    run(runtime, 0, 120, { a: [0, 1] });
    const a = s(runtime).world.bodies[0]?.position;
    expect(a?.y).toBeGreaterThan(110);
    expect(a?.x).toBeCloseTo(110, 6);
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

  it('a player outside the border carries the warning: seconds outside, the limit, and the way back in', () => {
    const arena = {
      width: 1600,
      height: 900,
      safeZone: { x: 200, y: 0, width: 1200, height: 900 },
      spawns: [
        { x: 800, y: 450 },
        { x: 1000, y: 450 },
        { x: 600, y: 300 },
        { x: 600, y: 600 },
        { x: 1000, y: 300 },
        { x: 1000, y: 600 },
      ],
    };
    const entries = roster();
    const base = createFuMatch(
      [
        { id: 'a', slot: 0 },
        { id: 'b', slot: 3 },
      ],
      { arena },
    );
    const state: FuState = {
      ...base,
      world: {
        ...base.world,
        bodies: base.world.bodies.map((b) =>
          b.id === 'a' ? { ...b, position: { x: 100, y: 450 } } : b,
        ),
      },
      players: base.players.map((p) => (p.id === 'a' ? { ...p, outsideFor: 2.5 } : p)),
    };
    const view = buildFuView(state, [], entries, slotsFor(entries));
    const a = view.circles.find((c) => c.id === 'a');
    expect(a?.outside).toEqual({ seconds: 2.5, limit: 5, toward: { x: 1, y: 0 } });
    expect(view.circles.find((c) => c.id === 'b')?.outside).toBeUndefined();
  });

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

  it('draws a deflected boomerang too, still in its OWNER’s colour (it is still their weapon)', () => {
    const { state, entries, slots } = playing();
    const deflected: FuState = {
      ...state,
      boomerangs: state.boomerangs.map((b) =>
        b.ownerId === 'a'
          ? {
              ...b,
              state: 'DEFLECTED' as const,
              position: { x: 400, y: 300 },
              direction: { x: 0, y: -1 },
              deflections: 1,
              deflectedBy: 'b',
            }
          : b,
      ),
    };
    expect(buildFuView(deflected, [], entries, slots).boomerangs).toEqual([
      expect.objectContaining({ ownerId: 'a', state: 'DEFLECTED', color: SLOT_STYLES[0]?.color }),
    ]);
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

  it('announces who is left standing, or that the round is over, while the round is over (not a round WIN: the race is in kills)', () => {
    const { state, entries, slots } = playing();
    const won: FuState = {
      ...state,
      phase: 'ROUND_OVER',
      roundOver: { winnerId: 'a', resetInSeconds: 2 },
    };
    expect(buildFuView(won, [], entries, slots).banner).toBe('Alvin is the last one standing');
    const draw: FuState = {
      ...state,
      phase: 'ROUND_OVER',
      roundOver: { winnerId: undefined, resetInSeconds: 2 },
    };
    expect(buildFuView(draw, [], entries, slots).banner).toBe('Round over');
  });

  it('turns rules events into drawable events, placed and coloured', () => {
    const { state, entries, slots } = playing();
    const view = buildFuView(
      state,
      [
        {
          type: 'THROWN',
          playerId: 'a',
          position: { x: 10, y: 20 },
          direction: { x: 1, y: 0 },
          power: 0,
        },
        {
          type: 'HIT',
          byId: 'a',
          victimId: 'b',
          position: { x: 30, y: 40 },
          source: 'BOOMERANG',
          creditedTo: 'a',
        },
        { type: 'CAUGHT', playerId: 'a' },
        { type: 'ROUND_START', round: 2 },
        { type: 'DROPPED', ownerId: 'b', position: { x: 50, y: 60 } },
        {
          type: 'DEFLECTED',
          byId: 'b',
          ownerId: 'a',
          position: { x: 70, y: 80 },
          direction: { x: 0, y: -1 },
        },
        { type: 'ROUND_OVER', winnerId: 'a' },
      ],
      entries,
      slots,
    );
    expect(view.events.map((e) => e.type)).toEqual([
      'THROWN',
      'HIT',
      'CAUGHT',
      'ROUND_START',
      'DROPPED', // a boomerang that could not get home landed (owner, 2026-10-19)
      'DEFLECTED',
    ]);
    expect(view.events[4]).toMatchObject({
      x: 50,
      y: 60,
      ownerId: 'b',
      color: SLOT_STYLES[1]?.color,
    });
    const clank = view.events.at(-1);
    expect(clank).toMatchObject({
      x: 70,
      y: 80,
      color: SLOT_STYLES[1]?.color,
      knock: { x: 0, y: -1 },
    }); // the defender's colour, and the way it went
    expect(view.events[0]).toMatchObject({ x: 10, y: 20, color: SLOT_STYLES[0]?.color });
    expect(view.events[1]).toMatchObject({ x: 30, y: 40, color: SLOT_STYLES[1]?.color }); // the victim's colour
    expect(view.events[2]).toMatchObject({ color: SLOT_STYLES[0]?.color });
  });

  it('draws a dashing player as dashing (with the direction), and turns a DASHED event into a drawable one', () => {
    const { state, entries, slots } = playing();
    const dashing = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              dash: {
                phase: 'DASHING' as const,
                direction: { x: 0, y: 1 },
                remaining: 0.1,
                speed: 1100,
              },
            }
          : p,
      ),
    };
    const view = buildFuView(
      dashing,
      [{ type: 'DASHED', playerId: 'a', position: { x: 5, y: 6 }, direction: { x: 0, y: 1 } }],
      entries,
      slots,
    );
    expect(view.circles[0]?.dashing).toEqual({ direction: { x: 0, y: 1 } });
    expect(view.circles[1]?.dashing).toBeUndefined();
    expect(view.events).toEqual([
      {
        type: 'DASHED',
        x: 5,
        y: 6,
        color: SLOT_STYLES[0]?.color,
        actor: 'a',
        direction: { x: 0, y: 1 },
      },
    ]);
  });

  it('draws a FATIGUED player as fatigued from the 9th dash on, and only then; the dead never', () => {
    const { state, entries, slots } = playing();
    const withDashes = (dashes: number, alive = true): FuState => ({
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, alive, fatigue: { dashes, recoverIn: 3 } } : p,
      ),
    });
    expect(buildFuView(withDashes(0), [], entries, slots).circles[0]?.fatigued).toBeUndefined();
    expect(buildFuView(withDashes(8), [], entries, slots).circles[0]?.fatigued).toBeUndefined();
    expect(buildFuView(withDashes(9), [], entries, slots).circles[0]?.fatigued).toBe(true);
    expect(buildFuView(withDashes(30), [], entries, slots).circles[0]?.fatigued).toBe(true);
    expect(buildFuView(withDashes(9), [], entries, slots).circles[1]?.fatigued).toBeUndefined();
    expect(
      buildFuView(withDashes(9, false), [], entries, slots).circles[0]?.fatigued,
    ).toBeUndefined();
  });

  it('turns FATIGUED and RECOVERED events into drawable ones at the player, in their colour', () => {
    const { state, entries, slots } = playing();
    const at = state.world.bodies[1]?.position;
    const view = buildFuView(
      state,
      [
        { type: 'FATIGUED', playerId: 'b' },
        { type: 'RECOVERED', playerId: 'b' },
      ],
      entries,
      slots,
    );
    expect(view.events).toEqual([
      { type: 'FATIGUED', x: at?.x, y: at?.y, color: SLOT_STYLES[1]?.color },
      { type: 'RECOVERED', x: at?.x, y: at?.y, color: SLOT_STYLES[1]?.color },
    ]);
  });

  it('a dead player is never drawn dashing', () => {
    const { state, entries, slots } = playing();
    const dead = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              alive: false,
              dash: {
                phase: 'DASHING' as const,
                direction: { x: 1, y: 0 },
                remaining: 0.1,
                speed: 1100,
              },
            }
          : p,
      ),
    };
    expect(buildFuView(dead, [], entries, slots).circles[0]?.dashing).toBeUndefined();
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
        actor: 'a',
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

  it('hands the renderer the arena’s walls exactly as the rules define them', () => {
    const { entries, slots } = playing();
    const state = createFuMatch(
      [
        { id: 'a', slot: 0 },
        { id: 'b', slot: 1 },
      ],
      { arena: PRIMITIVE_ARENA },
    );
    expect(buildFuView(state, [], entries, slots).walls).toEqual(PRIMITIVE_ARENA.walls);
  });

  it('the open Slice 1 arena has none', () => {
    const { state, entries, slots } = playing();
    expect(buildFuView(state, [], entries, slots).walls).toEqual([]);
  });

  it('a boomerang its own blast destroyed (SPENT) is not drawn, and its thrower is not shown armed until the new one', () => {
    const { state, entries, slots } = playing();
    const spent: FuState = {
      ...state,
      boomerangs: state.boomerangs.map((b) =>
        b.ownerId === 'a'
          ? { ...b, state: 'SPENT' as const, position: { x: 900, y: 300 }, respawn: 1 }
          : b,
      ),
    };
    const view = buildFuView(spent, [], entries, slots);
    expect(view.boomerangs.map((b) => b.ownerId)).not.toContain('a');
    expect(view.circles.find((c) => c.id === 'a')?.armed).toBe(false);
  });

  it('calling a dropped boomerang home: the thrower is shown calling and the boomerang being called, as long as THROW is held', () => {
    const { state, entries, slots } = playing();
    const lying = (patch: object): FuState => ({
      ...state,
      boomerangs: state.boomerangs.map((b) =>
        b.ownerId === 'a'
          ? { ...b, state: 'GROUNDED' as const, position: { x: 900, y: 300 }, ...patch }
          : b,
      ),
    });
    const calledOf = (s: FuState) => {
      const v = buildFuView(s, [], entries, slots);
      return {
        calling: v.circles.find((c) => c.id === 'a')?.calling === true,
        called: v.boomerangs.find((b) => b.ownerId === 'a')?.called === true,
      };
    };
    expect(calledOf(lying({ recall: 0 }))).toEqual({ calling: false, called: false }); // just lying there
    expect(calledOf(lying({ recall: 0.1 }))).toEqual({ calling: true, called: true }); // held: before it lifts
    expect(calledOf(lying({ state: 'RECALLING' }))).toEqual({ calling: true, called: true }); // on its way
  });

  it('a Book taken says who took it (actor), so the TV can hold the power’s badge over them', () => {
    const { state, entries, slots } = playing();
    const view = buildFuView(
      state,
      [
        {
          type: 'PICKED_UP',
          playerId: 'b',
          kind: 'SHIELD',
          pickupId: 1,
          position: { x: 500, y: 400 },
        },
      ],
      entries,
      slots,
    );
    expect(view.events.find((e) => e.type === 'PICKUP')).toMatchObject({
      actor: 'b',
      kind: 'SHIELD',
    });
  });

  it('is pure: the same inputs give the same view', () => {
    const { state, entries, slots } = playing();
    expect(buildFuView(state, [], entries, slots)).toEqual(buildFuView(state, [], entries, slots));
  });
});

describe('a dropped boomerang, through the runtime (owner, 2026-10-19)', () => {
  it('holding THROW pulls it home, the phone buzzing all the way, and the buzz stops when it is caught', () => {
    const runtime = new FuRuntime(OPEN);
    runtime.start(players, 0);
    const st = s(runtime);
    runtime.state = {
      ...st,
      boomerangs: st.boomerangs.map((b) =>
        b.ownerId === 'a'
          ? {
              ...b,
              state: 'GROUNDED' as const,
              position: { x: 1300, y: 450 },
              direction: { x: 0, y: 0 },
              velocity: { x: 0, y: 0 },
              recall: 0,
            }
          : b,
      ),
    };
    runtime.receiveAction(press('a', 'event-0001')); // held down…
    let now = 0;
    const buzzes: number[] = [];
    let pulled = false;
    for (let i = 0; i < 180 && boom(runtime, 'a')?.state !== 'HELD'; i += 1) {
      now = run(runtime, now, 1);
      if (boom(runtime, 'a')?.state === 'RECALLING') pulled = true;
      for (const r of runtime.rumbles(now)) if (r.playerId === 'a') buzzes.push(r.intensity);
    }
    expect(pulled, 'it lifted and was pulled').toBe(true);
    expect(boom(runtime, 'a')?.state).toBe('HELD');
    expect(buzzes.length).toBeGreaterThanOrEqual(2);
    // home: no more buzzing (the finger may still be down: it is charging the next throw now)
    now = run(runtime, now, 30);
    expect(runtime.rumbles(now).filter((r) => r.playerId === 'a')).toEqual([]);
    runtime.receiveAction(press('a', 'event-0002', 'released'));
  });
});
