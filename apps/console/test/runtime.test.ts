import { describe, expect, it } from 'vitest';
import { FixedStepAccumulator } from '../src/runtime/accumulator';
import {
  ARENA,
  MAX_SPEED,
  PLAYER_RADIUS,
  createArenaWorld,
  spawnPosition,
} from '../src/runtime/arena';
import { InputBuffer } from '../src/runtime/inputBuffer';
import { SLOT_STYLES, SlotAllocator } from '../src/runtime/slots';

const STEP = 1 / 60;

describe('FixedStepAccumulator: 60 Hz, at most 5 catch-up steps per frame, the rest discarded', () => {
  const frame = (acc: FixedStepAccumulator, ms: number) => acc.advance(ms / 1000);

  it('defaults to 1/60 s steps and 5 catch-up steps', () => {
    const acc = new FixedStepAccumulator();
    expect(acc.stepSeconds).toBe(STEP);
    expect(acc.maxCatchUpSteps).toBe(5);
  });

  it('at 60 fps it runs exactly one step per frame', () => {
    const acc = new FixedStepAccumulator();
    for (let i = 0; i < 120; i += 1) expect(frame(acc, 1000 / 60).steps).toBe(1);
    expect(acc.totalSteps).toBe(120);
    expect(acc.catchUpFrames).toBe(0);
    expect(acc.discardedSeconds).toBe(0);
  });

  it('at 30 fps it runs two steps per frame (simulation speed does not depend on frame rate)', () => {
    const acc = new FixedStepAccumulator();
    for (let i = 0; i < 60; i += 1) expect(frame(acc, 1000 / 30).steps).toBe(2);
    expect(acc.totalSteps).toBe(120);
    expect(acc.catchUpFrames).toBe(60); // every frame needed more than one step
  });

  it('at 144 Hz most frames run no step, and one second still yields 60 steps', () => {
    const acc = new FixedStepAccumulator();
    let steps = 0;
    for (let i = 0; i < 144; i += 1) steps += frame(acc, 1000 / 144).steps;
    expect(steps).toBeGreaterThanOrEqual(59);
    expect(steps).toBeLessThanOrEqual(60);
  });

  it('a long stall is NOT simulated: 5 steps, the rest discarded and counted', () => {
    const acc = new FixedStepAccumulator();
    const result = frame(acc, 2000); // the tab froze for two seconds
    expect(result.steps).toBe(5);
    expect(result.discardedSeconds).toBeCloseTo(115 * STEP, 9); // 120 steps' worth of time: run 5, discard 115
    expect(acc.totalSteps).toBe(5);
    expect(acc.catchUpFrames).toBe(1);
    expect(acc.discardedSeconds).toBeCloseTo(result.discardedSeconds, 12);
    expect(acc.discardEvents).toBe(1);
  });

  it('after a stall it recovers immediately: the next normal frame is one step', () => {
    const acc = new FixedStepAccumulator();
    frame(acc, 2000);
    expect(frame(acc, 1000 / 60).steps).toBe(1);
  });

  it.each([
    [83, 4],
    [84, 5],
    [100, 5],
  ])('a %i ms frame runs %i steps', (ms, steps) => {
    expect(frame(new FixedStepAccumulator(), ms).steps).toBe(steps);
  });

  it('exactly 5 steps of time (83.33 ms) is the largest catch-up with nothing discarded', () => {
    const result = new FixedStepAccumulator().advance(5 * STEP);
    expect(result.steps).toBe(5);
    expect(result.discardedSeconds).toBe(0);
  });

  it('keeps the fractional remainder so no time is lost or invented over many odd frames', () => {
    const acc = new FixedStepAccumulator();
    let simulated = 0;
    for (let i = 0; i < 1000; i += 1) simulated += acc.advance(0.0123).steps * STEP; // 12.3 ms frames
    expect(simulated).toBeCloseTo(1000 * 0.0123, 1);
    expect(acc.discardedSeconds).toBe(0);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0])(
    'elapsed %s runs no step and corrupts nothing',
    (elapsed) => {
      const acc = new FixedStepAccumulator();
      expect(acc.advance(elapsed)).toEqual({ steps: 0, discardedSeconds: 0 });
      expect(acc.advance(STEP).steps).toBe(1);
    },
  );

  it('is configurable, and rejects nonsense', () => {
    const acc = new FixedStepAccumulator({ stepSeconds: 1 / 30, maxCatchUpSteps: 2 });
    expect(acc.advance(1).steps).toBe(2);
    for (const bad of [
      { stepSeconds: 0 },
      { stepSeconds: -1 },
      { maxCatchUpSteps: 0 },
      { maxCatchUpSteps: 1.5 },
    ]) {
      expect(() => new FixedStepAccumulator(bad)).toThrow(RangeError);
    }
  });
});

describe('InputBuffer: latest movement per player, stale ones go neutral (never disconnect)', () => {
  it('holds the latest movement until it is replaced', () => {
    const buffer = new InputBuffer();
    buffer.receive('p1', 1, 0, 0);
    for (const t of [10, 100, 250, 400]) expect(buffer.frame(t).get('p1')).toEqual({ x: 1, y: 0 });
    buffer.receive('p1', -1, 0, 450);
    expect(buffer.frame(460).get('p1')).toEqual({ x: -1, y: 0 });
  });

  it('players are independent, and a player with no input is simply absent (zero movement)', () => {
    const buffer = new InputBuffer();
    buffer.receive('a', 1, 0, 0);
    buffer.receive('b', -1, 0, 0);
    const frame = buffer.frame(10);
    expect(frame.get('a')).toEqual({ x: 1, y: 0 });
    expect(frame.get('b')).toEqual({ x: -1, y: 0 });
    expect(frame.has('nobody')).toBe(false);
  });

  describe('freshness (500 ms by default)', () => {
    it('movement is fresh up to, and stale from, the timeout', () => {
      const buffer = new InputBuffer();
      buffer.receive('p1', 1, 0, 1000);
      expect(buffer.frame(1499).get('p1')).toEqual({ x: 1, y: 0 });
      expect(buffer.frame(1500).has('p1')).toBe(false); // the interval has elapsed with no refresh
    });

    it('a refresh (the controller sends one every 250 ms) keeps it alive indefinitely', () => {
      const buffer = new InputBuffer();
      for (let t = 0; t <= 10_000; t += 250) buffer.receive('p1', 1, 0, t);
      expect(buffer.frame(10_100).get('p1')).toEqual({ x: 1, y: 0 });
      expect(buffer.staleNeutralizations).toBe(0);
    });

    it('stale movement becomes neutral and is counted once, not once per step', () => {
      const buffer = new InputBuffer();
      buffer.receive('p1', 1, 0, 0);
      for (let t = 600; t < 1000; t += 16) buffer.frame(t);
      expect(buffer.staleNeutralizations).toBe(1);
    });

    it('fresh input revives the player', () => {
      const buffer = new InputBuffer();
      buffer.receive('p1', 1, 0, 0);
      expect(buffer.frame(700).has('p1')).toBe(false);
      buffer.receive('p1', 0.5, 0, 710);
      expect(buffer.frame(720).get('p1')).toEqual({ x: 0.5, y: 0 });
      buffer.frame(1500);
      expect(buffer.staleNeutralizations).toBe(2);
    });

    it('a stale NEUTRAL is not a problem and is not counted', () => {
      const buffer = new InputBuffer();
      buffer.receive('p1', 0, 0, 0);
      buffer.frame(5_000);
      expect(buffer.staleNeutralizations).toBe(0);
    });

    it('the timeout is configurable', () => {
      const buffer = new InputBuffer({ freshnessMs: 100 });
      buffer.receive('p1', 1, 0, 0);
      expect(buffer.frame(99).has('p1')).toBe(true);
      expect(buffer.frame(100).has('p1')).toBe(false);
      for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => new InputBuffer({ freshnessMs: bad })).toThrow(RangeError);
      }
    });
  });

  it('a player who is not active (reconnecting, away) is neutral at once and not counted as stale', () => {
    const buffer = new InputBuffer();
    buffer.receive('p1', 1, 0, 0);
    const frame = buffer.frame(10, (id) => id !== 'p1');
    expect(frame.has('p1')).toBe(false);
    expect(buffer.staleNeutralizations).toBe(0);
    expect(buffer.frame(20).get('p1')).toEqual({ x: 1, y: 0 }); // back in the game: the value is still there until it goes stale
  });

  it('forgetting a player removes them', () => {
    const buffer = new InputBuffer();
    buffer.receive('p1', 1, 0, 0);
    buffer.forget('p1');
    expect(buffer.frame(10).has('p1')).toBe(false);
  });

  it.each([
    [Number.NaN, 0],
    [0, Number.POSITIVE_INFINITY],
  ])('non-finite input (%s, %s) is ignored, never stored', (x, y) => {
    const buffer = new InputBuffer();
    buffer.receive('p1', x, y, 0);
    expect(buffer.frame(1).has('p1')).toBe(false);
  });

  describe('honest latency: host receive → the simulation step that uses it (one clock, so it is real)', () => {
    it('measures time between arrival and first use, and only once per message', () => {
      const buffer = new InputBuffer();
      expect(buffer.latency()).toEqual({
        samples: 0,
        lastMs: undefined,
        meanMs: undefined,
        maxMs: undefined,
      });
      buffer.receive('p1', 1, 0, 100);
      buffer.frame(112);
      buffer.frame(129); // the same message again: not a new sample
      buffer.receive('p1', 1, 0, 130);
      buffer.frame(133);
      expect(buffer.latency()).toEqual({ samples: 2, lastMs: 3, meanMs: 7.5, maxMs: 12 });
    });
  });
});

describe('SlotAllocator: a player keeps their circle', () => {
  const seated = (ids: string[]) => ids.map((playerId) => ({ playerId, seated: true }));

  it('has six distinct styles: a colour, a number and a shape, so colour is never the only cue', () => {
    expect(SLOT_STYLES).toHaveLength(6);
    expect(new Set(SLOT_STYLES.map((s) => s.color)).size).toBe(6);
    expect(new Set(SLOT_STYLES.map((s) => s.marker)).size).toBe(6);
    expect(new Set(SLOT_STYLES.map((s) => s.shape)).size).toBe(6);
    expect(SLOT_STYLES.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('assigns the lowest free slot on first sight', () => {
    const slots = new SlotAllocator();
    slots.sync(seated(['a', 'b', 'c']));
    expect([slots.slotOf('a'), slots.slotOf('b'), slots.slotOf('c')]).toEqual([0, 1, 2]);
  });

  it('is stable: roster order, repeats and reconnects never change a slot', () => {
    const slots = new SlotAllocator();
    slots.sync(seated(['a', 'b', 'c']));
    slots.sync(seated(['c', 'a', 'b']));
    slots.sync(seated(['b', 'c', 'a']));
    expect([slots.slotOf('a'), slots.slotOf('b'), slots.slotOf('c')]).toEqual([0, 1, 2]);
  });

  it('a player who stays seated through a disconnect keeps their slot', () => {
    const slots = new SlotAllocator();
    slots.sync(seated(['a', 'b']));
    slots.sync([
      { playerId: 'a', seated: true },
      { playerId: 'b', seated: true },
    ]);
    expect(slots.slotOf('b')).toBe(1);
  });

  it('a released seat frees its slot, and a newcomer may take it', () => {
    const slots = new SlotAllocator();
    slots.sync(seated(['a', 'b', 'c']));
    slots.sync([
      { playerId: 'a', seated: true },
      { playerId: 'b', seated: false },
      { playerId: 'c', seated: true },
    ]);
    expect(slots.slotOf('b')).toBeUndefined();
    slots.sync([
      { playerId: 'a', seated: true },
      { playerId: 'b', seated: false },
      { playerId: 'c', seated: true },
      { playerId: 'd', seated: true },
    ]);
    expect(slots.slotOf('d')).toBe(1);
    expect(slots.slotOf('c')).toBe(2);
  });

  it('never hands one slot to two players', () => {
    const slots = new SlotAllocator();
    slots.sync(seated(['a', 'b', 'c', 'd', 'e', 'f']));
    const used = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => slots.slotOf(id));
    expect(new Set(used).size).toBe(6);
    expect(Math.max(...(used as number[]))).toBe(5);
  });

  it('a seventh seated player (impossible by capacity) gets no slot rather than corrupting another', () => {
    const slots = new SlotAllocator();
    slots.sync(seated(['a', 'b', 'c', 'd', 'e', 'f', 'g']));
    expect(slots.slotOf('g')).toBeUndefined();
    expect(slots.slotOf('a')).toBe(0);
  });
});

describe('the primitive arena', () => {
  it('is a fixed world: 1600 × 900 units, with every spawn inside it', () => {
    expect(ARENA).toEqual({ width: 1600, height: 900 });
    for (let slot = 0; slot < 6; slot += 1) {
      const { x, y } = spawnPosition(slot);
      expect(x).toBeGreaterThanOrEqual(PLAYER_RADIUS);
      expect(x).toBeLessThanOrEqual(ARENA.width - PLAYER_RADIUS);
      expect(y).toBeGreaterThanOrEqual(PLAYER_RADIUS);
      expect(y).toBeLessThanOrEqual(ARENA.height - PLAYER_RADIUS);
    }
  });

  it('gives six slots six distinct, well-separated spawn points', () => {
    const points = Array.from({ length: 6 }, (_, slot) => spawnPosition(slot));
    for (let i = 0; i < 6; i += 1) {
      for (let j = i + 1; j < 6; j += 1) {
        const a = points[i];
        const b = points[j];
        expect(Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0))).toBeGreaterThan(
          4 * PLAYER_RADIUS,
        );
      }
    }
  });

  it('builds a game-core world keyed by player id, in world units per second', () => {
    const world = createArenaWorld([
      { playerId: 'p-1', slot: 0 },
      { playerId: 'p-2', slot: 3 },
    ]);
    expect(world.bodies.map((b) => b.id)).toEqual(['p-1', 'p-2']);
    expect(world.arena).toEqual(ARENA);
    expect(world.movement.maxSpeed).toBe(MAX_SPEED);
    expect(world.bodies[0]?.position).toEqual(spawnPosition(0));
    expect(world.bodies[0]?.radius).toBe(PLAYER_RADIUS);
  });
});
