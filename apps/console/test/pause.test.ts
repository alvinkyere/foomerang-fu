import { DEFAULT_FU_CONFIG } from '@foomerang/foomerang-fu';
import { describe, expect, it } from 'vitest';
import { FuRuntime } from '../src/runtime/fuRuntime';
import { MatchDirector } from '../src/runtime/matchDirector';
import { GameRuntime } from '../src/runtime/gameRuntime';
import type { RosterEntry } from '@foomerang/protocol';

const roster = (): RosterEntry[] => [
  { playerId: 'a', displayName: 'A', connection: 'CONNECTED', seat: 'HELD' },
  { playerId: 'b', displayName: 'B', connection: 'CONNECTED', seat: 'HELD' },
];

const FRAME = 1000 / 60;
const OPEN = DEFAULT_FU_CONFIG.arena;

function director() {
  const d = new MatchDirector(
    () => new GameRuntime(),
    () => {},
  );
  d.onRoom('PLAYING', roster(), 0, 'primitive-arena');
  return d;
}
const posA = (d: MatchDirector) => d.runtime.world?.bodies.find((b) => b.id === 'a')?.position;
function run(d: MatchDirector, from: number, frames: number): number {
  let t = from;
  for (let i = 0; i < frames; i += 1) {
    t += FRAME;
    d.frame(t);
  }
  return t;
}

describe('manual pause is a real simulation freeze, distinct from a network pause', () => {
  it('freezes the simulation: nothing steps while paused', () => {
    const d = director();
    d.onMovement('a', 1, 0, 0);
    const t = run(d, 0, 30);
    const frozen = posA(d);
    const steps = d.runtime.metrics().simulationSteps;
    d.setManualPause(true, t);
    expect(d.manualPaused).toBe(true);
    expect(d.paused).toBe(true);
    run(d, t, 120);
    expect(posA(d)).toEqual(frozen);
    expect(d.runtime.metrics().simulationSteps).toBe(steps);
  });

  it('resumes WITHOUT catch-up: the time spent paused is never simulated', () => {
    const d = director();
    d.onMovement('a', 1, 0, 0);
    let t = run(d, 0, 20);
    d.setManualPause(true, t);
    t += 60_000; // a minute at the pause menu
    d.setManualPause(false, t);
    const before = posA(d);
    const stepsBefore = d.runtime.metrics().simulationSteps;
    d.onMovement('a', 1, 0, t);
    run(d, t, 1);
    expect((d.runtime.metrics().simulationSteps ?? 0) - stepsBefore).toBeLessThanOrEqual(2);
    expect(Math.abs((posA(d)?.x ?? 0) - (before?.x ?? 0))).toBeLessThan(20);
    expect(d.runtime.metrics().discardedSimulationMs).toBe(0);
  });

  it('is independent of the network pause: each can be set and cleared on its own', () => {
    const d = director();
    d.setPaused(true, 0); // the host lost its server connection
    d.setManualPause(true, 0); // and somebody paused as well
    d.setPaused(false, 100); // the connection came back
    expect(d.paused).toBe(true); // still paused: the menu is open
    expect(d.manualPaused).toBe(true);
    d.setManualPause(false, 200);
    expect(d.paused).toBe(false);
  });

  it('a network pause does not read as a manual one', () => {
    const d = director();
    d.setPaused(true, 0);
    expect(d.paused).toBe(true);
    expect(d.manualPaused).toBe(false);
  });

  it('input held when the pause begins is not kept for the resume', () => {
    const d = director();
    d.onMovement('a', 1, 0, 0);
    const t = run(d, 0, 10);
    d.setManualPause(true, t);
    d.setManualPause(false, t + 50);
    const x0 = posA(d)?.x ?? 0;
    run(d, t + 50, 30);
    expect(Math.abs((posA(d)?.x ?? 0) - x0)).toBeLessThan(1); // the stick was neutralized, not resumed
  });

  it('returning to the lobby or starting a rematch clears a manual pause', () => {
    const d = director();
    d.setManualPause(true, 0);
    d.rematch(10);
    expect(d.manualPaused).toBe(false);
    d.setManualPause(true, 20);
    d.returnToLobby();
    expect(d.manualPaused).toBe(false);
    expect(d.paused).toBe(false);
  });
});

describe('Foomerang Fu: pausing freezes every clock and keeps no pending action', () => {
  function fu() {
    const rt = new FuRuntime(OPEN);
    rt.start(
      [
        { playerId: 'a', slot: 0 },
        { playerId: 'b', slot: 3 },
      ],
      0,
    );
    return rt;
  }
  const press = (
    playerId: string,
    eventId: string,
    action: 'PRIMARY' | 'SECONDARY' | 'TERTIARY',
  ) => ({
    playerId,
    eventId,
    action,
    phase: 'pressed' as const,
  });

  it('a press that was queued but not yet used is thrown away by neutralizeInput (nothing fires on resume)', () => {
    const rt = fu();
    rt.receiveAction(press('a', 'evt-000001', 'SECONDARY')); // THROW, pending
    rt.neutralizeInput();
    rt.rebase(1000);
    let t = 1000;
    for (let i = 0; i < 20; i += 1) {
      t += FRAME;
      rt.frame(t);
    }
    expect(rt.state?.players.find((p) => p.id === 'a')?.slash.phase).toBe('READY');
    const thrown = rt.state?.boomerangs.find((b) => b.ownerId === 'a')?.state;
    expect(thrown).toBe('HELD');
  });

  it('reports its phase so the host can tell a match from its results', () => {
    const rt = fu();
    expect(rt.matchPhase()).toBe('PLAYING');
  });
});
