import type { RosterEntry } from '@foomerang/protocol';
import { describe, expect, it } from 'vitest';
import { PLAYER_RADIUS, spawnPosition } from '../src/runtime/arena';
import { GameRuntime } from '../src/runtime/gameRuntime';
import { SlotAllocator, SLOT_STYLES } from '../src/runtime/slots';
import { buildArenaView } from '../src/render/viewModel';

const players = [
  { playerId: 'a', slot: 0 },
  { playerId: 'b', slot: 3 },
];

/** Runs frames of `frameMs` for `seconds`, starting at host time `from`. Returns the end time. */
function run(runtime: GameRuntime, from: number, seconds: number, frameMs: number): number {
  let now = from;
  const end = from + seconds * 1000;
  while (now < end) {
    now += frameMs;
    runtime.frame(now);
  }
  return now;
}

const xOf = (runtime: GameRuntime, id: string) =>
  runtime.world?.bodies.find((b) => b.id === id)?.position.x ?? Number.NaN;
const yOf = (runtime: GameRuntime, id: string) =>
  runtime.world?.bodies.find((b) => b.id === id)?.position.y ?? Number.NaN;

describe('GameRuntime: input → fixed-step game-core simulation', () => {
  it('does nothing, and claims nothing, before a match starts', () => {
    const runtime = new GameRuntime();
    runtime.frame(100);
    expect(runtime.world).toBeUndefined();
    expect(runtime.metrics()).toMatchObject({
      fps: undefined,
      frameMs: undefined,
      simulationSteps: 0,
    });
  });

  it('starts a world with every player at their slot’s spawn point', () => {
    const runtime = new GameRuntime();
    runtime.start(players, 0);
    expect(runtime.world?.bodies.map((b) => [b.id, b.position])).toEqual([
      ['a', spawnPosition(0)],
      ['b', spawnPosition(3)],
    ]);
  });

  it('covers the same distance per second whatever the display’s frame rate (60, 30, 144 fps)', () => {
    for (const frameMs of [1000 / 60, 1000 / 30, 1000 / 144]) {
      const runtime = new GameRuntime();
      runtime.start(players, 0);
      let now = 0;
      const end = 1000;
      while (now < end) {
        now += frameMs;
        runtime.receiveInput('a', 1, 0, now); // the controller keeps refreshing, so it stays fresh
        runtime.frame(now);
      }
      expect(
        xOf(runtime, 'a') - spawnPosition(0).x,
        `${frameMs.toFixed(1)} ms frames`,
      ).toBeGreaterThan(400);
      expect(
        xOf(runtime, 'a') - spawnPosition(0).x,
        `${frameMs.toFixed(1)} ms frames`,
      ).toBeLessThan(430);
    }
  });

  it('moves only the player whose thumb moved (isolation), in the direction pushed (+Y down)', () => {
    const runtime = new GameRuntime();
    runtime.start(players, 0);
    runtime.receiveInput('a', 1, 0, 0);
    runtime.receiveInput('b', 0, 1, 0);
    run(runtime, 0, 0.3, 1000 / 60);
    expect(xOf(runtime, 'a')).toBeGreaterThan(spawnPosition(0).x + 50);
    expect(yOf(runtime, 'a')).toBe(spawnPosition(0).y);
    expect(yOf(runtime, 'b')).toBeGreaterThan(spawnPosition(3).y + 50); // down is positive
    expect(xOf(runtime, 'b')).toBe(spawnPosition(3).x);
  });

  it('a stalled tab is not simulated: five steps, then the rest is discarded and counted', () => {
    const runtime = new GameRuntime();
    runtime.start(players, 0);
    runtime.receiveInput('a', 1, 0, 1990); // fresh when the stalled frame finally arrives
    runtime.frame(2000); // two seconds in one frame
    const moved = xOf(runtime, 'a') - spawnPosition(0).x;
    expect(moved).toBeCloseTo(5 * (1 / 60) * 420, 3);
    expect(runtime.metrics()).toMatchObject({
      simulationSteps: 5,
      catchUpFrames: 1,
      discardEvents: 1,
    });
    expect(runtime.metrics().discardedSimulationMs).toBeGreaterThan(1500);
  });

  it('stale movement stops the character after 500 ms without a refresh — and nobody is disconnected', () => {
    const runtime = new GameRuntime();
    runtime.start(players, 0);
    runtime.receiveInput('a', 1, 0, 0); // ...and then the controller goes silent
    run(runtime, 0, 2, 1000 / 60);
    const moved = xOf(runtime, 'a') - spawnPosition(0).x;
    expect(moved).toBeGreaterThan(190);
    expect(moved).toBeLessThan(230); // ~0.5 s × 420 u/s, then it stopped
    expect(runtime.metrics().staleNeutralizations).toBe(1);
  });

  it('a refreshed thumb keeps moving past the timeout', () => {
    const runtime = new GameRuntime();
    runtime.start(players, 0);
    let now = 0;
    while (now < 1500) {
      now += 1000 / 60;
      if (Math.round(now) % 250 < 17) runtime.receiveInput('a', 1, 0, now); // ~every 250 ms
      runtime.frame(now);
    }
    expect(xOf(runtime, 'a') - spawnPosition(0).x).toBeGreaterThan(500);
    expect(runtime.metrics().staleNeutralizations).toBe(0);
  });

  it('a player who is reconnecting is inactive: their character stops, keeps its identity and position, and resumes', () => {
    const runtime = new GameRuntime();
    runtime.start(players, 0);
    let active = true;
    runtime.setActivity(() => active);
    let now = 0;
    const tick = (ms: number) => {
      const end = now + ms;
      while (now < end) {
        now += 1000 / 60;
        runtime.receiveInput('a', 1, 0, now);
        runtime.frame(now);
      }
    };
    tick(300);
    const before = xOf(runtime, 'a');
    active = false;
    tick(300);
    expect(xOf(runtime, 'a')).toBeCloseTo(before, 6); // frozen where it was
    active = true;
    tick(300);
    expect(xOf(runtime, 'a')).toBeGreaterThan(before + 50);
    expect(runtime.world?.bodies.map((b) => b.id)).toEqual(['a', 'b']); // the same object throughout
  });

  it('ignores input for players who are not in the match', () => {
    const runtime = new GameRuntime();
    runtime.start(players, 0);
    runtime.receiveInput('ghost', 1, 0, 0);
    expect(() => run(runtime, 0, 0.2, 1000 / 60)).not.toThrow();
    expect(runtime.world?.bodies.map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('keeps every circle inside the arena however long a thumb is held', () => {
    const runtime = new GameRuntime();
    runtime.start(players, 0);
    let now = 0;
    for (let i = 0; i < 600; i += 1) {
      now += 1000 / 60;
      runtime.receiveInput('a', 1, 1, now);
      runtime.frame(now);
    }
    expect(xOf(runtime, 'a')).toBe(1600 - PLAYER_RADIUS);
    expect(yOf(runtime, 'a')).toBe(900 - PLAYER_RADIUS);
  });

  describe('metrics are measured, never invented', () => {
    it('reports FPS and frame time from real frame deltas', () => {
      const runtime = new GameRuntime();
      runtime.start(players, 0);
      run(runtime, 0, 1, 1000 / 60);
      const m = runtime.metrics();
      expect(m.fps).toBeCloseTo(60, 0);
      expect(m.frameMs).toBeCloseTo(16.67, 1);
      expect(m.frameMaxMs).toBeCloseTo(16.67, 1);
      expect(m.simulationSteps).toBeGreaterThanOrEqual(59);
      expect(m.catchUpFrames).toBe(0);
    });

    it('a slow display shows up as lower FPS and catch-up frames', () => {
      const runtime = new GameRuntime();
      runtime.start(players, 0);
      run(runtime, 0, 1, 1000 / 30);
      expect(runtime.metrics().fps).toBeCloseTo(30, 0);
      expect(runtime.metrics().catchUpFrames).toBeGreaterThan(25);
    });

    it('reports the host-side receive → simulation time of input, from one clock', () => {
      const runtime = new GameRuntime();
      runtime.start(players, 0);
      runtime.receiveInput('a', 1, 0, 1000);
      runtime.frame(1000 + 10);
      expect(runtime.metrics().inputToSim.samples).toBe(1);
      expect(runtime.metrics().inputToSim.lastMs).toBeCloseTo(10, 6);
    });

    it('ignores a frame timestamp that goes backwards', () => {
      const runtime = new GameRuntime();
      runtime.start(players, 1000);
      runtime.frame(1017);
      runtime.frame(900);
      runtime.frame(1034);
      expect(Number.isFinite(runtime.metrics().fps ?? 0)).toBe(true);
    });

    it('counts the players in the match', () => {
      const runtime = new GameRuntime();
      runtime.start(players, 0);
      expect(runtime.metrics().players).toBe(2);
    });
  });

  it('a new match starts clean: counters, inputs and positions', () => {
    const runtime = new GameRuntime();
    runtime.start(players, 0);
    runtime.receiveInput('a', 1, 0, 0);
    run(runtime, 0, 0.5, 1000 / 60);
    runtime.start(players, 5000);
    expect(xOf(runtime, 'a')).toBe(spawnPosition(0).x);
    expect(runtime.metrics().simulationSteps).toBe(0);
    run(runtime, 5000, 0.2, 1000 / 60);
    expect(xOf(runtime, 'a')).toBe(spawnPosition(0).x); // the old input did not survive
  });
});

describe('buildArenaView: game-core state → what Phaser draws (Phaser never simulates)', () => {
  const roster = (overrides: Partial<RosterEntry>[] = []): RosterEntry[] => [
    { playerId: 'a', displayName: 'Alvin', connection: 'CONNECTED', seat: 'HELD', ...overrides[0] },
    { playerId: 'b', displayName: 'David', connection: 'CONNECTED', seat: 'HELD', ...overrides[1] },
  ];

  function view(entries: RosterEntry[] = roster()) {
    const runtime = new GameRuntime();
    runtime.start(players, 0);
    const slots = new SlotAllocator();
    slots.sync(entries.map((e) => ({ playerId: e.playerId, seated: e.seat === 'HELD' })));
    const world = runtime.world;
    if (!world) throw new Error('no world');
    return buildArenaView(world, entries, slots);
  }

  it('draws the arena and one circle per body at the body’s position', () => {
    const v = view();
    expect(v.width).toBe(1600);
    expect(v.height).toBe(900);
    expect(v.circles.map((c) => [c.id, c.x, c.y, c.radius])).toEqual([
      ['a', spawnPosition(0).x, spawnPosition(0).y, PLAYER_RADIUS],
      ['b', spawnPosition(3).x, spawnPosition(3).y, PLAYER_RADIUS],
    ]);
  });

  it('identifies each player by name, number, shape AND colour', () => {
    const [a, b] = view().circles;
    expect(a).toMatchObject({
      label: 'Alvin',
      number: 1,
      color: SLOT_STYLES[0]?.color,
      shape: 'circle',
    });
    expect(b).toMatchObject({
      label: 'David',
      number: 2,
      color: SLOT_STYLES[1]?.color,
      shape: 'square',
    });
  });

  it('a reconnecting player keeps the same colour and number but is shown as away', () => {
    const [a] = view(roster([{ connection: 'RECONNECTING' }])).circles;
    expect(a).toMatchObject({ number: 1, status: 'RECONNECTING', dimmed: true });
  });

  it.each(['RECONNECTING', 'DISCONNECTED'] as const)(
    '%s is dimmed; CONNECTED is not',
    (connection) => {
      expect(view(roster([{ connection }])).circles[0]?.dimmed).toBe(true);
      expect(view().circles[0]?.dimmed).toBe(false);
    },
  );

  it('a released seat is shown as gone', () => {
    const [a] = view(roster([{ connection: 'DISCONNECTED', seat: 'RELEASED' }])).circles;
    expect(a).toMatchObject({ status: 'RELEASED', dimmed: true });
  });

  it('a body with no roster entry is drawn honestly as unknown, not crashed on', () => {
    const v = view([
      { playerId: 'b', displayName: 'David', connection: 'CONNECTED', seat: 'HELD' },
    ]);
    expect(v.circles[0]).toMatchObject({
      id: 'a',
      label: 'Player',
      status: 'DISCONNECTED',
      dimmed: true,
    });
  });

  it('is a pure function: the same state gives the same view', () => {
    expect(view()).toEqual(view());
  });
});
