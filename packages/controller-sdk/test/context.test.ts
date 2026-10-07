import type { ControllerManifest } from '@foomerang/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { createControllerSession, type ControllerSession } from '../src/session';
import { createClock, FakeNetwork, MemoryStore, settle } from './support/fakes';

const MANIFEST: ControllerManifest = {
  gameId: 'foomerang-fu',
  orientation: 'landscape',
  controls: [
    { id: 'MOVE', type: 'joystick' },
    { id: 'SLASH', type: 'button', action: 'PRIMARY' },
    { id: 'THROW', type: 'button', action: 'SECONDARY' },
    { id: 'DASH', type: 'button', action: 'TERTIARY' },
  ],
};

let sessions: ControllerSession[] = [];
afterEach(() => {
  for (const s of sessions) s.dispose();
  sessions = [];
});

function build(withContext = true) {
  const net = new FakeNetwork();
  net.manifest = MANIFEST;
  if (!withContext) net.context = undefined;
  const clock = createClock();
  const session = createControllerSession({
    transportFactory: net.factory,
    environment: clock.environment,
    store: new MemoryStore(),
  });
  sessions.push(session);
  return { net, clock, session };
}
async function ready() {
  const ctx = build();
  ctx.session.join('K7M4PX', 'Alice');
  await settle();
  return ctx;
}
const moves = (net: FakeNetwork) => net.allSent('INPUT_MOVE').map((m) => m.payload);
const events = (net: FakeNetwork) =>
  net.allSent('INPUT_EVENT').map((m) => `${m.payload?.['action']}:${m.payload?.['phase']}`);

describe('the controller waits for its context before it is interactive', () => {
  it('has the manifest but is not READY until the context has arrived (no flash of wrong labels)', async () => {
    const { session } = build(false);
    session.join('K7M4PX', 'Alice');
    await settle();
    expect(session.getState().manifest).toBeDefined();
    expect(session.getState().context).toBeUndefined();
    expect(session.getState().phase).not.toBe('READY');
  });

  it('becomes READY the moment the context arrives, already holding it', async () => {
    const { session, net } = build(false);
    session.join('K7M4PX', 'Alice');
    await settle();
    await net.pushContext('CONSOLE');
    expect(session.getState().phase).toBe('READY');
    expect(session.getState().context).toEqual({
      context: 'CONSOLE',
      secondaryAction: null,
      version: 1,
    });
  });

  it('a phone joining a paused room is READY in PAUSED, never in GAMEPLAY first', async () => {
    const net = new FakeNetwork();
    net.manifest = MANIFEST;
    net.context = { context: 'PAUSED', secondaryAction: null, version: 7 };
    const session = createControllerSession({
      transportFactory: net.factory,
      environment: createClock().environment,
      store: new MemoryStore(),
    });
    sessions.push(session);
    const seen: (string | undefined)[] = [];
    session.subscribe(() =>
      seen.push(
        session.getState().phase === 'READY' ? session.getState().context?.context : undefined,
      ),
    );
    session.join('K7M4PX', 'Alice');
    await settle();
    expect(seen.filter((c) => c !== undefined)).toEqual(['PAUSED']);
  });
});

describe('context changes', () => {
  it('each semantic context is exposed to the UI (GAMEPLAY retains its controls, the others are menu semantics)', async () => {
    const { session, net } = await ready();
    expect(session.getState().context?.context).toBe('GAMEPLAY');
    for (const context of ['CONSOLE', 'PAUSED', 'RESULTS', 'GAMEPLAY'] as const) {
      await net.pushContext(context);
      expect(session.getState().context?.context).toBe(context);
    }
  });

  it('carries the secondary action, or null', async () => {
    const { session, net } = await ready();
    await net.pushContext('CONSOLE', { label: 'OPTIONS' });
    expect(session.getState().context?.secondaryAction).toEqual({ label: 'OPTIONS' });
    await net.pushContext('CONSOLE', null);
    expect(session.getState().context?.secondaryAction).toBeNull();
  });

  it('a stale (or repeated) version never overwrites a newer context', async () => {
    const { session, net } = await ready();
    await net.pushContext('PAUSED', null, 10);
    net.last.deliver({
      type: 'CONTROLLER_CONTEXT',
      payload: { context: 'GAMEPLAY', secondaryAction: null, version: 9 },
    });
    await settle();
    net.last.deliver({
      type: 'CONTROLLER_CONTEXT',
      payload: { context: 'RESULTS', secondaryAction: null, version: 10 },
    });
    await settle();
    expect(session.getState().context).toMatchObject({ context: 'PAUSED', version: 10 });
  });

  it('never changes the manifest: the manifest is the physical controller, the context is its meaning', async () => {
    const { session, net } = await ready();
    const manifest = session.getState().manifest;
    await net.pushContext('CONSOLE');
    expect(session.getState().manifest).toBe(manifest);
  });

  it('after a reconnect the new epoch accepts the server’s context even at the same version', async () => {
    const { session, net, clock } = await ready();
    await net.pushContext('PAUSED', null, 5);
    net.last.serverDrops();
    await settle();
    clock.advance(300);
    await settle();
    expect(session.getState().phase).toBe('READY');
    expect(session.getState().context).toMatchObject({ context: 'PAUSED', version: 5 });
  });

  it('a host-less or unknown context is ignored rather than trusted', async () => {
    const { session, net } = await ready();
    net.last.deliver({
      type: 'CONTROLLER_CONTEXT',
      payload: { context: 'SETTINGS', secondaryAction: null, version: 99 },
    });
    await settle();
    expect(session.getState().context?.context).toBe('GAMEPLAY');
  });
});

describe('transition safety: a held control never carries across a context boundary', () => {
  it('a stick held through a context change reads as neutral until it comes back to neutral', async () => {
    const { session, net, clock } = await ready();
    session.setControlValue('MOVE', { x: 1, y: 0 });
    clock.advance(40);
    expect(moves(net).at(-1)).toMatchObject({ x: 1 });
    await net.pushContext('CONSOLE');
    clock.advance(40);
    expect(moves(net).at(-1)).toEqual({ x: 0, y: 0 }); // neutral NOW, not at the next movement
    session.setControlValue('MOVE', { x: 1, y: 0 }); // still held: still neutral
    clock.advance(100);
    expect(moves(net).at(-1)).toEqual({ x: 0, y: 0 });
    session.setControlValue('MOVE', { x: 0, y: 0 }); // returns to centre …
    clock.advance(100);
    session.setControlValue('MOVE', { x: 0.9, y: 0 }); // … and only now counts again
    clock.advance(100);
    expect(moves(net).at(-1)).toMatchObject({ x: 0.9 });
  });

  it('a stick at rest is not latched by a context change', async () => {
    const { session, net, clock } = await ready();
    await net.pushContext('CONSOLE');
    session.setControlValue('MOVE', { x: 0.8, y: 0 });
    clock.advance(100);
    expect(moves(net).at(-1)).toMatchObject({ x: 0.8 });
  });

  it('a button held through a context change sends only its release, and a fresh press is a fresh press', async () => {
    const { session, net } = await ready();
    await net.pushContext('PAUSED');
    session.setButton('SLASH', true); // pressed to choose Resume …
    expect(events(net)).toEqual(['PRIMARY:pressed']);
    await net.pushContext('GAMEPLAY'); // … which switches the context
    session.setButton('SLASH', true); // still held: not a new press
    expect(events(net)).toEqual(['PRIMARY:pressed']);
    session.setButton('SLASH', false);
    expect(events(net)).toEqual(['PRIMARY:pressed', 'PRIMARY:released']);
    session.setButton('SLASH', true);
    expect(events(net)).toEqual(['PRIMARY:pressed', 'PRIMARY:released', 'PRIMARY:pressed']);
  });

  it('THROW and DASH held across a boundary behave the same', async () => {
    const { session, net } = await ready();
    session.setButton('THROW', true);
    session.setButton('DASH', true);
    await net.pushContext('GAMEPLAY', null, 50);
    session.setButton('THROW', true);
    session.setButton('DASH', true);
    expect(events(net)).toEqual(['SECONDARY:pressed', 'TERTIARY:pressed']);
  });
});
