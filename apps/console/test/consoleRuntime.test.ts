import { describe, expect, it } from 'vitest';
import { createConsoleRuntime } from '../src/consoleRuntime';
import { FrameLoop } from '../src/runtime/frameLoop';
import { spawnPosition } from '../src/runtime/arena';
import { FakeHostNetwork, MemoryHostStore, createClock, roster, settle } from './support/hostFakes';

async function started() {
  const clock = createClock();
  const network = new FakeHostNetwork();
  let now = 0;
  const runtime = createConsoleRuntime({
    transportFactory: network.factory,
    environment: clock.environment,
    store: new MemoryHostStore(),
    now: () => now,
  });
  runtime.session.createRoom('primitive-arena');
  await settle();
  return {
    clock,
    network,
    runtime,
    setNow: (t: number) => {
      now = t;
    },
  };
}

const bodyOf = (r: Awaited<ReturnType<typeof started>>['runtime'], id: string) =>
  r.director.runtime.world?.bodies.find((b) => b.id === id)?.position;

describe('createConsoleRuntime: server → session → director → game-core', () => {
  it('turns a server PLAYING snapshot into bodies, and PLAYER_INPUT into movement of only that body', async () => {
    const { network, runtime, setNow } = await started();
    network.roomUpdated(
      network.last,
      'PLAYING',
      roster({ playerId: 'a', displayName: 'A' }, { playerId: 'b', displayName: 'B' }),
    );
    await settle();
    expect(bodyOf(runtime, 'a')).toEqual(spawnPosition(0));

    let t = 0;
    const input = (id: string, x: number, y: number) =>
      network.last.deliver({
        type: 'PLAYER_INPUT',
        payload: { playerId: id, input: { kind: 'MOVE', seq: t, x, y } },
      });
    input('a', 1, 0);
    await settle();
    for (let i = 0; i < 18; i += 1) {
      t += 1000 / 60;
      setNow(t);
      runtime.frame(t);
    }
    expect(bodyOf(runtime, 'a')?.x).toBeGreaterThan(spawnPosition(0).x + 50);
    expect(bodyOf(runtime, 'b')).toEqual(spawnPosition(1)); // B's thumb never moved
  });

  it('the lobby has no bodies; a snapshot with a different room state does not start a match', async () => {
    const { network, runtime } = await started();
    network.roomUpdated(network.last, 'LOBBY', roster({ playerId: 'a', displayName: 'A' }));
    await settle();
    expect(runtime.director.arenaView()).toBeUndefined();
    expect(runtime.director.slots.slotOf('a')).toBe(0);
  });

  it('dispose() stops the session and leaves nothing scheduled', async () => {
    const { clock, runtime } = await started();
    runtime.dispose();
    expect(clock.scheduler.pending).toBe(0);
  });
});

describe('FrameLoop: one requestAnimationFrame at a time, and nothing left behind', () => {
  function fakeRaf() {
    let next = 1;
    const callbacks = new Map<number, (t: number) => void>();
    return {
      request: (cb: (t: number) => void) => {
        const id = next++;
        callbacks.set(id, cb);
        return id;
      },
      cancel: (id: number) => {
        callbacks.delete(id);
      },
      get pending() {
        return callbacks.size;
      },
      fire(t: number) {
        const [[id, cb]] = [...callbacks.entries()] as [[number, (t: number) => void]];
        callbacks.delete(id);
        cb(t);
      },
    };
  }

  it('calls back once per frame with the browser timestamp, rescheduling itself', () => {
    const raf = fakeRaf();
    const seen: number[] = [];
    const loop = new FrameLoop(raf.request, raf.cancel);
    loop.start((t) => seen.push(t));
    raf.fire(16);
    raf.fire(33);
    expect(seen).toEqual([16, 33]);
    expect(raf.pending).toBe(1);
  });

  it('stop() cancels the pending frame; a second start() does not double up', () => {
    const raf = fakeRaf();
    const loop = new FrameLoop(raf.request, raf.cancel);
    loop.start(() => undefined);
    loop.start(() => undefined);
    expect(raf.pending).toBe(1);
    loop.stop();
    expect(raf.pending).toBe(0);
    loop.stop();
  });

  it('a callback that throws does not kill the loop', () => {
    const raf = fakeRaf();
    const errors: unknown[] = [];
    const loop = new FrameLoop(raf.request, raf.cancel, (e) => errors.push(e));
    let calls = 0;
    loop.start(() => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
    });
    expect(() => raf.fire(1)).not.toThrow();
    raf.fire(2);
    expect(calls).toBe(2);
    expect(errors).toHaveLength(1); // reported, not swallowed
  });
});
