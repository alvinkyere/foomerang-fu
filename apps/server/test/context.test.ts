import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRig, msg, type Rig } from './support/rig';

let rig: Rig;
beforeEach(async () => {
  rig = createRig();
  await rig.start();
});
afterEach(async () => {
  await rig.stop();
});

const setContext = (seq: number, context: string, secondaryAction: unknown = null) => ({
  type: 'CONTROLLER_CONTEXT',
  seq,
  payload: { context, secondaryAction },
});
const start = { type: 'MATCH_START', payload: {} };
const end = { type: 'MATCH_END', payload: {} };

const contexts = (client: ReturnType<Rig['player']>['client']) =>
  client.received.filter((m) => m.type === 'CONTROLLER_CONTEXT').map((m) => m.payload);

/** A room with a host and one phone, with the match running (so every context is legal). */
function playing() {
  const host = rig.host();
  const phone = rig.player(host.joinCode, 'Alice');
  host.client.send(start);
  return { host, phone };
}

describe('CONTROLLER_CONTEXT: the host decides, the server stores and relays', () => {
  it('a new room starts in CONSOLE, version 1, and a joining phone is told before it can act', () => {
    const { joinCode } = rig.host();
    const phone = rig.player(joinCode, 'Alice').client;
    const types = phone.received.map((m) => m.type);
    // identity → manifest → context: the phone never believes it is in gameplay
    expect(types.indexOf('CONTROLLER_MANIFEST')).toBe(types.indexOf('ROOM_JOINED') + 1);
    expect(types.indexOf('CONTROLLER_CONTEXT')).toBe(types.indexOf('CONTROLLER_MANIFEST') + 1);
    expect(contexts(phone)).toEqual([{ context: 'CONSOLE', secondaryAction: null, version: 1 }]);
  });

  it('MATCH_START moves every phone to GAMEPLAY and MATCH_END back to CONSOLE (the server never leaves a menu on a game)', () => {
    const { client: host, joinCode } = rig.host();
    const phone = rig.player(joinCode, 'Alice').client;
    host.send(start);
    expect(contexts(phone).at(-1)).toMatchObject({ context: 'GAMEPLAY', version: 2 });
    host.send(end);
    expect(contexts(phone).at(-1)).toMatchObject({ context: 'CONSOLE', version: 3 });
  });

  it('relays a host context to every connected phone, with a new version', () => {
    const { host, phone } = playing();
    const bob = rig.player(host.joinCode, 'Bob');
    host.client.send(setContext(1, 'PAUSED'));
    for (const p of [phone, bob]) {
      expect(contexts(p.client).at(-1)).toEqual({
        context: 'PAUSED',
        secondaryAction: null,
        version: 3, // CONSOLE(1) → GAMEPLAY(2) → PAUSED(3)
      });
    }
    expect(host.client.errors()).toEqual([]);
  });

  it('carries the optional secondary action', () => {
    const { host, phone } = playing();
    host.client.send(setContext(1, 'RESULTS', { label: 'DETAILS' }));
    expect(contexts(phone.client).at(-1)).toMatchObject({
      context: 'RESULTS',
      secondaryAction: { label: 'DETAILS' },
    });
  });

  it('says nothing when the host re-sends what is already true (no version churn, no flicker)', () => {
    const { host, phone } = playing();
    host.client.send(setContext(1, 'GAMEPLAY'));
    host.client.send(setContext(2, 'GAMEPLAY'));
    expect(contexts(phone.client).map((c) => c.version)).toEqual([1, 2]);
  });
});

describe('who may set it, and what is legal', () => {
  it('a controller cannot set (or request) its own context', () => {
    const { phone } = playing();
    phone.client.send(setContext(1, 'CONSOLE'));
    expect(phone.client.errors()).toEqual(['UNAUTHORIZED']);
    expect(contexts(phone.client).at(-1)).toMatchObject({ context: 'GAMEPLAY' });
  });

  it('a console that holds no room cannot', () => {
    const { host, phone } = playing();
    const bare = rig.connect('console');
    bare.send(setContext(1, 'PAUSED'));
    expect(bare.errors()).toEqual(['UNAUTHORIZED']);
    expect(contexts(phone.client).at(-1)).toMatchObject({ context: 'GAMEPLAY' });
    expect(host.client.errors()).toEqual([]);
  });

  it('nothing before the handshake', () => {
    const client = rig.raw();
    client.send(setContext(1, 'PAUSED'));
    expect(client.errors()).toEqual(['HANDSHAKE_REQUIRED']);
  });

  it('malformed context messages are rejected and change nothing', () => {
    const { host, phone } = playing();
    const before = contexts(phone.client).length;
    for (const bad of [
      setContext(1, 'SETTINGS'),
      setContext(1, 'console'),
      setContext(1, 'PAUSED', { label: 'anything I like' }),
      { type: 'CONTROLLER_CONTEXT', payload: { context: 'PAUSED', secondaryAction: null } },
      { ...setContext(1, 'PAUSED'), extra: true },
    ]) {
      host.client.send(bad);
    }
    expect(host.client.errors().every((e) => e === 'INVALID_MESSAGE')).toBe(true);
    expect(host.client.errors()).toHaveLength(5);
    expect(contexts(phone.client)).toHaveLength(before);
  });

  it('outside a running match only CONSOLE is legal: a lobby can never be left in GAMEPLAY, PAUSED or RESULTS', () => {
    const { client: host, joinCode } = rig.host();
    const phone = rig.player(joinCode, 'Alice').client;
    for (const [i, context] of (['GAMEPLAY', 'PAUSED', 'RESULTS'] as const).entries()) {
      host.send(setContext(i + 1, context));
    }
    expect(host.errors()).toEqual(['INVALID_STATE', 'INVALID_STATE', 'INVALID_STATE']);
    expect(contexts(phone)).toEqual([{ context: 'CONSOLE', secondaryAction: null, version: 1 }]);
    host.send(setContext(4, 'CONSOLE', { label: 'OPTIONS' }));
    expect(contexts(phone).at(-1)).toMatchObject({ secondaryAction: { label: 'OPTIONS' } });
  });
});

describe('ordering: a stale context can never overwrite a newer one', () => {
  it('drops a host message whose seq is not newer (per host connection)', () => {
    const { host, phone } = playing();
    host.client.send(setContext(5, 'PAUSED'));
    host.client.send(setContext(4, 'GAMEPLAY')); // late arrival
    host.client.send(setContext(5, 'GAMEPLAY')); // duplicate seq
    expect(contexts(phone.client).at(-1)).toMatchObject({ context: 'PAUSED' });
    expect(host.client.errors()).toEqual([]); // reordering is normal, not a violation
  });

  it('a reconnecting host starts its own seq again and is not locked out; versions keep rising', () => {
    const { host, phone } = playing();
    host.client.send(setContext(7, 'PAUSED'));
    const versionBefore = contexts(phone.client).at(-1)?.version ?? 0;
    host.client.drop();
    const again = rig.connect('console');
    again.send(msg.hostReconnect(host.joinCode, host.hostToken));
    expect(again.last('HOST_RECONNECTED')).toBeTruthy();
    again.send(setContext(1, 'GAMEPLAY'));
    expect(contexts(phone.client).at(-1)).toMatchObject({ context: 'GAMEPLAY' });
    expect(contexts(phone.client).at(-1)?.version).toBeGreaterThan(versionBefore);
  });
});

describe('reconnect and late join', () => {
  it('a phone joining while the host is paused gets PAUSED at once, never GAMEPLAY first', () => {
    const { host } = playing();
    host.client.send(setContext(1, 'PAUSED'));
    const late = rig.player(host.joinCode, 'Late');
    const seen = contexts(late.client);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ context: 'PAUSED' });
  });

  it('a reconnecting phone gets the current context after identity and manifest', () => {
    const { host, phone } = playing();
    host.client.send(setContext(1, 'RESULTS'));
    phone.client.drop();
    const back = rig.connect('controller');
    back.send(msg.reconnect(host.joinCode, phone.reconnectToken));
    const types = back.received.map((m) => m.type);
    expect(types.indexOf('CONTROLLER_MANIFEST')).toBe(types.indexOf('PLAYER_RECONNECTED') + 1);
    expect(types.indexOf('CONTROLLER_CONTEXT')).toBe(types.indexOf('CONTROLLER_MANIFEST') + 1);
    expect(contexts(back).at(-1)).toMatchObject({ context: 'RESULTS' });
  });

  it('the context belongs to the room: two rooms never share one', () => {
    const a = rig.host();
    const b = rig.host();
    const pa = rig.player(a.joinCode, 'A');
    const pb = rig.player(b.joinCode, 'B');
    a.client.send(start);
    rig.player(a.joinCode, 'A2');
    expect(contexts(pa.client).at(-1)).toMatchObject({ context: 'GAMEPLAY' });
    expect(contexts(pb.client).at(-1)).toMatchObject({ context: 'CONSOLE' });
  });
});

describe('room reset and closure leave nothing behind', () => {
  it('a room that returns to its lobby is CONSOLE again, whatever the host last said', () => {
    const { host, phone } = playing();
    host.client.send(setContext(1, 'PAUSED'));
    host.client.send(end);
    expect(contexts(phone.client).at(-1)).toMatchObject({ context: 'CONSOLE' });
    const late = rig.player(host.joinCode, 'Late');
    expect(contexts(late.client).at(-1)).toMatchObject({ context: 'CONSOLE' });
  });

  it('a second match starts in GAMEPLAY, not in whatever the last one ended on', () => {
    const { host, phone } = playing();
    host.client.send(setContext(1, 'RESULTS'));
    host.client.send(end);
    host.client.send(start);
    expect(contexts(phone.client).at(-1)).toMatchObject({ context: 'GAMEPLAY' });
  });
});

describe('limits', () => {
  it('context messages are rate limited per connection (a runaway host cannot flood every phone)', () => {
    const { host, phone } = playing();
    for (let i = 1; i <= 300; i += 1) {
      host.client.send(setContext(i, i % 2 ? 'PAUSED' : 'GAMEPLAY'));
    }
    expect(contexts(phone.client).length).toBeLessThan(80); // the burst allowance, not 300
  });
});

void msg;
