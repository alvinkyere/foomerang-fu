import { describe, expect, it } from 'vitest';
import { createConsoleRuntime } from '../src/consoleRuntime';
import { MAP_POOL, PRODUCT_POOL } from '../src/runtime/mapRotation';
import { FakeHostNetwork, MemoryHostStore, createClock, roster, settle } from './support/hostFakes';

const players = roster({ playerId: 'a', displayName: 'A' }, { playerId: 'b', displayName: 'B' });

/** Deterministic randomness (a fixed sequence), so the maps chosen are reproducible. */
function sequence(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

async function console(
  arena: NonNullable<Parameters<typeof createConsoleRuntime>[0]['arena']>,
  gameId = 'foomerang-fu',
) {
  const clock = createClock();
  const network = new FakeHostNetwork();
  let now = 0;
  const runtime = createConsoleRuntime({
    transportFactory: network.factory,
    environment: clock.environment,
    store: new MemoryHostStore(),
    now: () => now,
    inputPump: false,
    arena,
    random: sequence(0.13, 0.71, 0.42, 0.9, 0.05, 0.66, 0.3),
  });
  runtime.session.createRoom(gameId);
  await settle();
  const changes: (string | undefined)[] = [];
  runtime.subscribeArena(() => changes.push(runtime.arena()));
  return {
    runtime,
    changes,
    async enter(state: string) {
      network.roomUpdated(network.last, state, players);
      await settle();
    },
    advance: (ms: number) => (now += ms),
  };
}

describe('every match is on a different map, always', () => {
  it('a match on a rotating console is on one of the rendered maps, and the view names it', async () => {
    const c = await console('rotate');
    expect(c.runtime.arena()).toBeUndefined(); // no match yet: no map
    await c.enter('PLAYING');
    const map = c.runtime.arena();
    expect(MAP_POOL).toContain(map);
    expect(c.changes).toEqual([map]);
  });

  it('a REMATCH is on a different map; so is the next match after the lobby', async () => {
    const c = await console('rotate');
    await c.enter('PLAYING');
    const first = c.runtime.arena();
    c.runtime.rematch();
    const second = c.runtime.arena();
    expect(second).not.toBe(first);
    c.runtime.returnToLobby();
    await c.enter('LOBBY');
    await c.enter('PLAYING');
    const third = c.runtime.arena();
    expect(third).not.toBe(second);
    expect(c.changes).toEqual([first, second, third]);
  });

  it('over many matches the map never repeats back to back', async () => {
    const c = await console('rotate');
    await c.enter('PLAYING');
    let last = c.runtime.arena();
    for (let i = 0; i < 40; i += 1) {
      c.runtime.rematch();
      const next = c.runtime.arena();
      expect(next, `match ${i + 2}`).not.toBe(last);
      last = next;
    }
  });

  it('a pinned map (developer / test address) stays put across rematches', async () => {
    const c = await console('hedge_maze');
    await c.enter('PLAYING');
    c.runtime.rematch();
    expect(c.runtime.arena()).toBe('hedge_maze');
  });

  it('the rules play the map the renderer is told about', async () => {
    const c = await console('rotate');
    await c.enter('PLAYING');
    const map = c.runtime.arena();
    for (let t = 0; t < 2_000 && c.runtime.director.arenaView()?.arenaId === undefined; t += 50) {
      c.advance(50);
      c.runtime.frame(t);
      await new Promise((resolve) => setTimeout(resolve, 10)); // the real rules load lazily (a dynamic import)
    }
    expect(c.runtime.director.arenaView()?.arenaId).toBe(map);
  });

  it('a game that is not Foomerang Fu has no map', async () => {
    const c = await console('rotate', 'primitive-arena');
    await c.enter('PLAYING');
    expect(c.runtime.arena()).toBeUndefined();
  });

  it('the product rotates the plaza and the gong islands: every match the other one', async () => {
    expect(PRODUCT_POOL).toEqual(['market_plaza', 'gong_islands']);
    const c = await console('product');
    const seen: (string | undefined)[] = [];
    for (let i = 0; i < 6; i += 1) {
      await c.enter('PLAYING');
      seen.push(c.runtime.arena());
      await c.enter('LOBBY');
    }
    for (const m of seen) expect(PRODUCT_POOL).toContain(m);
    for (let i = 1; i < seen.length; i += 1) expect(seen[i]).not.toBe(seen[i - 1]);
  });
});
