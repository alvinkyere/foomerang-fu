import { describe, expect, it } from 'vitest';
import { LazyFuRuntime, loadFuRuntime } from '../src/runtime/lazyFuRuntime';
import { SlotAllocator } from '../src/runtime/slots';

const players = [
  { playerId: 'a', slot: 0 },
  { playerId: 'b', slot: 3 },
];
const throwPress = (eventId: string) => ({
  playerId: 'a',
  eventId,
  action: 'SECONDARY' as const,
  phase: 'pressed' as const,
});

describe('LazyFuRuntime: the game rules are a chunk the lobby never downloads', () => {
  it('simulates and draws nothing until the rules have loaded, and says so honestly', () => {
    const lazy = new LazyFuRuntime();
    lazy.start(players, 0);
    lazy.frame(100);
    expect(lazy.world).toBeUndefined();
    expect(lazy.state).toBeUndefined();
    expect(lazy.view([], new SlotAllocator())).toBeUndefined();
    expect(lazy.metrics()).toMatchObject({ fps: undefined, simulationSteps: 0, players: 0 });
    expect(lazy.debugState()).toBeUndefined();
  });

  it('hands over the thumbs and presses that arrived while it loaded, in order, as if nothing had waited', async () => {
    const lazy = new LazyFuRuntime();
    lazy.setActivity(() => true);
    lazy.start(players, 0);
    lazy.receiveInput('a', 0, 1, 5); // the latest thumb wins
    lazy.receiveInput('a', 1, 0, 10);
    lazy.receiveAction(throwPress('event-0001'));
    lazy.receiveAction(throwPress('event-0001')); // a duplicate: the real runtime still ignores it
    await loadFuRuntime();
    expect(lazy.state?.round).toBe(1);
    lazy.frame(20);
    lazy.frame(40);
    const mine = lazy.state?.boomerangs.find((b) => b.ownerId === 'a');
    expect(mine?.state).toBe('THROWN');
    expect(lazy.state?.players[0]?.facing).toEqual({ x: 1, y: 0 });
    expect(lazy.metrics().players).toBe(2);
  });

  it('uses the activity rule it was given, before and after loading', async () => {
    const lazy = new LazyFuRuntime();
    let active = false;
    lazy.setActivity(() => active);
    lazy.start(players, 0);
    await loadFuRuntime();
    lazy.receiveAction(throwPress('event-0001'));
    lazy.frame(20);
    expect(lazy.state?.boomerangs.find((b) => b.ownerId === 'a')?.state).toBe('HELD');
    active = true;
    lazy.receiveAction(throwPress('event-0002'));
    lazy.frame(40);
    expect(lazy.state?.boomerangs.find((b) => b.ownerId === 'a')?.state).toBe('THROWN');
  });

  it('never keeps an unbounded pile of presses while loading', async () => {
    const lazy = new LazyFuRuntime();
    lazy.setActivity(() => true);
    lazy.start(players, 0);
    for (let i = 0; i < 5_000; i += 1) lazy.receiveAction(throwPress(`event-${i}`));
    await loadFuRuntime();
    expect(lazy.state).toBeDefined();
  });
});
