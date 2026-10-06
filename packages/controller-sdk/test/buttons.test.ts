import { inputEventMessageSchema, type ControllerManifest } from '@foomerang/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { createControllerSession, type ControllerSession } from '../src/session';
import { createClock, FakeNetwork, MemoryStore, settle } from './support/fakes';

const FU_MANIFEST: ControllerManifest = {
  gameId: 'foomerang-fu',
  orientation: 'landscape',
  controls: [
    { id: 'MOVE', type: 'joystick' },
    { id: 'THROW', type: 'button', action: 'PRIMARY' },
  ],
};

let sessions: ControllerSession[] = [];
afterEach(() => {
  for (const session of sessions) session.dispose();
  sessions = [];
});

async function ready(options: { manifest?: ControllerManifest; newEventId?: () => string } = {}) {
  const net = new FakeNetwork();
  net.manifest = options.manifest ?? FU_MANIFEST;
  const clock = createClock();
  const session = createControllerSession({
    transportFactory: net.factory,
    environment: clock.environment,
    store: new MemoryStore(),
    ...(options.newEventId ? { newEventId: options.newEventId } : {}),
  });
  sessions.push(session);
  session.join('K7M4PX', 'Alice');
  await settle();
  expect(session.getState().phase).toBe('READY');
  return { net, clock, session };
}

const events = (net: FakeNetwork) => net.allSent('INPUT_EVENT');

describe('button controls: the manifest says what a button sends', () => {
  it('a press sends ONE pressed event for the action the button names', async () => {
    const { net, session } = await ready();
    session.setButton('THROW', true);
    expect(events(net)).toHaveLength(1);
    expect(events(net)[0]).toMatchObject({
      type: 'INPUT_EVENT',
      seq: 0,
      payload: { action: 'PRIMARY', phase: 'pressed' },
    });
  });

  it('every event it sends is a valid INPUT_EVENT on the wire', async () => {
    const { net, session } = await ready();
    session.setButton('THROW', true);
    session.setButton('THROW', false);
    for (const sent of events(net))
      expect(inputEventMessageSchema.safeParse(sent).success).toBe(true);
  });

  it('a release sends a released event', async () => {
    const { net, session } = await ready();
    session.setButton('THROW', true);
    session.setButton('THROW', false);
    expect(events(net).map((e) => e.payload)).toEqual([
      { action: 'PRIMARY', phase: 'pressed' },
      { action: 'PRIMARY', phase: 'released' },
    ]);
    expect(events(net).map((e) => e.seq)).toEqual([0, 1]);
  });

  it('HOLDING sends nothing more: there is no auto-repeat, so a held button cannot throw twice', async () => {
    const { net, clock, session } = await ready();
    session.setButton('THROW', true);
    session.setButton('THROW', true);
    session.setButton('THROW', true);
    clock.advance(5_000); // a long hold, with the 60 Hz sampler and heartbeat running
    expect(events(net)).toHaveLength(1);
  });

  it('a release without a press is ignored', async () => {
    const { net, session } = await ready();
    session.setButton('THROW', false);
    expect(events(net)).toEqual([]);
  });

  it('gives every press its own unique event id (the server deduplicates on it)', async () => {
    const { net, session } = await ready();
    for (let i = 0; i < 20; i += 1) {
      session.setButton('THROW', true);
      session.setButton('THROW', false);
    }
    const ids = events(net).map((e) => e['eventId']);
    expect(new Set(ids).size).toBe(40);
  });

  it('event ids are unique across sessions too (a reloaded controller must not reuse them)', async () => {
    const a = await ready();
    const b = await ready();
    a.session.setButton('THROW', true);
    b.session.setButton('THROW', true);
    expect(events(a.net)[0]?.['eventId']).not.toBe(events(b.net)[0]?.['eventId']);
  });

  it('uses an injected id generator (so tests and other platforms control it)', async () => {
    let n = 0;
    const { net, session } = await ready({ newEventId: () => `test-event-${(n += 1)}` });
    session.setButton('THROW', true);
    session.setButton('THROW', false);
    expect(events(net).map((e) => e['eventId'])).toEqual(['test-event-1', 'test-event-2']);
  });

  it('ignores controls that are not buttons in the manifest', async () => {
    const { net, session } = await ready();
    session.setButton('MOVE', true); // a joystick
    session.setButton('NOPE', true); // not in the manifest
    expect(events(net)).toEqual([]);
  });

  it('does nothing with a manifest that has no buttons', async () => {
    const { net, session } = await ready({
      manifest: {
        gameId: 'foomerang-fu',
        orientation: 'landscape',
        controls: [{ id: 'MOVE', type: 'joystick' }],
      },
    });
    session.setButton('THROW', true);
    expect(events(net)).toEqual([]);
  });

  it('two buttons send their own actions', async () => {
    const { net, session } = await ready({
      manifest: {
        gameId: 'x',
        orientation: 'landscape',
        controls: [
          { id: 'THROW', type: 'button', action: 'PRIMARY' },
          { id: 'DASH', type: 'button', action: 'SECONDARY' },
        ],
      },
    });
    session.setButton('DASH', true);
    session.setButton('THROW', true);
    expect(events(net).map((e) => (e.payload as { action: string }).action)).toEqual([
      'SECONDARY',
      'PRIMARY',
    ]);
  });
});

describe('buttons and interruptions', () => {
  it('neutralize() releases a held button (hidden page, cancelled touch)', async () => {
    const { net, session } = await ready();
    session.setButton('THROW', true);
    session.neutralize();
    expect(events(net).map((e) => (e.payload as { phase: string }).phase)).toEqual([
      'pressed',
      'released',
    ]);
    session.neutralize(); // nothing held now: nothing more is sent
    expect(events(net)).toHaveLength(2);
  });

  it('a press while the connection is down is DROPPED, never queued to fire later', async () => {
    const { net, session } = await ready();
    net.last.serverDrops();
    expect(session.getState().phase).toBe('RECONNECTING');
    session.setButton('THROW', true);
    session.setButton('THROW', false);
    await settle();
    // after the reconnect completes, nothing from that press arrives
    expect(events(net)).toEqual([]);
  });

  it('after a reconnect a held button starts over: it must be pressed again, with a fresh id and seq', async () => {
    const { net, clock, session } = await ready();
    session.setButton('THROW', true);
    const firstId = events(net)[0]?.['eventId'];
    net.last.serverDrops();
    clock.advance(250);
    await settle();
    expect(session.getState().phase).toBe('READY');
    session.setButton('THROW', true); // the player presses again
    const all = events(net);
    expect(all).toHaveLength(2);
    expect(all[1]?.['eventId']).not.toBe(firstId);
    expect(all[1]?.seq).toBe(0); // a new connection's event stream starts at 0
  });

  it('does nothing after dispose()', async () => {
    const { net, session } = await ready();
    session.dispose();
    session.setButton('THROW', true);
    expect(events(net)).toEqual([]);
  });
});
