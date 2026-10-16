import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createConsoleRuntime } from '../src/consoleRuntime';
import type { ArenaRenderer, ArenaRendererLoader } from '../src/render/renderer';
import { FrameLoop } from '../src/runtime/frameLoop';
import { MAP_POOL } from '../src/runtime/mapRotation';
import { ArenaScreen } from '../src/ui/ArenaScreen';
import { FakeHostNetwork, MemoryHostStore, createClock, roster, settle } from './support/hostFakes';

class FakeRenderer implements ArenaRenderer {
  destroyed = false;
  render() {}
  drawn() {
    return [];
  }
  drawnBoomerangs() {
    return [];
  }
  drawnWalls() {
    return [];
  }
  destroy() {
    this.destroyed = true;
  }
}

/** A frame loop that never fires by itself (the test does not need frames). */
const idleLoop = () =>
  new FrameLoop(
    () => 1,
    () => undefined,
  );

describe('the arena screen draws the map of THIS match, and changes with it', () => {
  it('loads the renderer for the match’s map, and a rematch on a new map swaps it', async () => {
    const network = new FakeHostNetwork();
    const runtime = createConsoleRuntime({
      transportFactory: network.factory,
      environment: createClock().environment,
      store: new MemoryHostStore(),
      now: () => 0,
      inputPump: false,
      arena: 'rotate',
      random: () => 0.37,
    });
    runtime.session.createRoom('foomerang-fu');
    await settle();
    network.roomUpdated(
      network.last,
      'PLAYING',
      roster({ playerId: 'a', displayName: 'A' }, { playerId: 'b', displayName: 'B' }),
    );
    await settle();

    const renderers: FakeRenderer[] = [];
    const loadRenderer = vi.fn<ArenaRendererLoader>(() => {
      const renderer = new FakeRenderer();
      renderers.push(renderer);
      return Promise.resolve(renderer);
    });
    render(<ArenaScreen runtime={runtime} loadRenderer={loadRenderer} createLoop={idleLoop} />);
    await act(async () => void (await settle()));

    const first = runtime.arena();
    expect(MAP_POOL).toContain(first);
    expect(loadRenderer.mock.calls.map((c) => c[1])).toEqual([first]);

    await act(async () => {
      runtime.rematch();
      await settle();
    });
    const second = runtime.arena();
    expect(second).not.toBe(first);
    expect(loadRenderer.mock.calls.map((c) => c[1])).toEqual([first, second]);
    expect(renderers[0]?.destroyed).toBe(true); // the old map's renderer is gone
    expect(renderers[1]?.destroyed).toBe(false);
  });
});
