import { describe, expect, it } from 'vitest';
import type { FakeClient } from './support/fakes';
import { createRig, msg } from './support/rig';

/** Small deterministic PRNG so a failing sequence can be replayed from its seed. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Phone {
  client: FakeClient;
  controllerId: string;
  token: string;
  /** Rotated-away credentials: must never work again. */
  old: string[];
  /** Left, removed, or ended with the console: terminal. */
  over: boolean;
}

const OPS = [
  'join',
  'join',
  'drop',
  'reconnect',
  'takeover',
  'stale',
  'leave',
  'remove',
  'removeUnknown',
  'hostDrop',
  'hostBack',
  'time',
  'time',
  'malformed',
  'unauthorized',
  'close',
] as const;

describe('server console-session invariants over arbitrary interleavings (seeded, replayable)', () => {
  const SEQUENCES = 60;
  const STEPS = 70;

  it(`${SEQUENCES} sequences × ${STEPS} operations`, async () => {
    for (let seed = 1; seed <= SEQUENCES; seed += 1) {
      const random = mulberry32(seed);
      const pick = <T>(items: readonly T[]): T | undefined =>
        items[Math.floor(random() * items.length)];
      // Rate limiting has its own tests; here it would only make the model guess which requests the
      // budget let through, so the budgets are lifted and the test is about lifecycle alone.
      const generous = { burst: 1_000_000, refillPerSecond: 1_000_000 };
      const rig = createRig({
        rateLimits: {
          room: generous,
          other: generous,
          maxInvalidMessages: 1_000_000,
        },
      });
      await rig.start();
      const opened = rig.console();
      let tv: FakeClient | undefined = opened.client;
      let hostToken = opened.hostToken;
      const oldHostTokens: string[] = [];
      const { joinCode } = opened;
      const phones: Phone[] = [];
      let consoleOver = false;

      for (let step = 0; step < STEPS && !consoleOver; step += 1) {
        const where = (op: string) => `seed ${seed}, step ${step} (${op})`;
        const live = phones.filter((p) => !p.over);
        const target = pick(live);
        const op = pick(OPS) ?? 'join';

        switch (op) {
          case 'join': {
            const client = rig.connect('controller');
            client.send(msg.controllerJoin(joinCode, `P${step}`));
            const joined = client.last('CONTROLLER_JOINED');
            if (joined) {
              phones.push({
                client,
                controllerId: joined.payload.controllerId,
                token: joined.payload.reconnectToken,
                old: [],
                over: false,
              });
            } else {
              expect(client.errors().length, where(op)).toBe(1);
            }
            break;
          }
          case 'drop':
            target?.client.drop();
            break;
          case 'reconnect':
          case 'takeover':
            if (target) {
              if (op === 'takeover') target.client.connection.deferCloseEvent = true;
              const client = rig.connect('controller');
              client.send(msg.controllerReconnect(joinCode, target.token));
              const back = client.last('CONTROLLER_RECONNECTED');
              if (back) {
                expect(back.payload.controllerId, where(op)).toBe(target.controllerId);
                target.old.push(target.token);
                target.token = back.payload.reconnectToken;
                const displaced = target.client;
                target.client = client;
                displaced.connection.flushClose(); // the stale close, late
              } else {
                // released by absence meanwhile: terminal from now on
                expect(client.errors(), where(op)).toEqual(['SEAT_RELEASED']);
                target.over = true;
              }
            }
            break;
          case 'stale': {
            const someone = pick(phones);
            const token = someone && (someone.over ? someone.token : pick(someone.old));
            if (token !== undefined) {
              const client = rig.connect('controller');
              client.send(msg.controllerReconnect(joinCode, token));
              expect(
                client.last('CONTROLLER_RECONNECTED'),
                where('stale credential'),
              ).toBeUndefined();
            }
            break;
          }
          case 'leave':
            if (
              target &&
              target.client.last('CONSOLE_ENDED') === undefined &&
              !target.client.closed
            ) {
              target.client.send(msg.controllerLeave());
              target.over = true;
            }
            break;
          case 'remove':
            if (target && tv) {
              tv.send(msg.controllerRemove(target.controllerId));
              target.over = true;
            }
            break;
          case 'removeUnknown':
            tv?.send(msg.controllerRemove('controller-999'));
            break;
          case 'hostDrop':
            tv?.drop();
            tv = undefined;
            break;
          case 'hostBack': {
            if (tv) break;
            const stale = pick(oldHostTokens);
            if (stale !== undefined) {
              const thief = rig.connect('console');
              thief.send(msg.hostReconnect(joinCode, stale));
              expect(thief.last('HOST_RECONNECTED'), where('stale host token')).toBeUndefined();
            }
            const next = rig.connect('console');
            next.send(msg.hostReconnect(joinCode, hostToken));
            const back = next.last('HOST_RECONNECTED');
            if (back) {
              oldHostTokens.push(hostToken);
              hostToken = back.payload.hostToken;
              tv = next;
            }
            break;
          }
          case 'time':
            rig.advance(pick([0, 1_000, 9_999, 10_000, 30_000, 60_000, 600_000]) ?? 0);
            break;
          case 'malformed': {
            const sender = pick(
              [tv, target?.client].filter((c): c is FakeClient => c !== undefined),
            );
            sender?.send(
              pick([
                { type: 'CONTROLLER_REMOVE', payload: { controllerId: 'bad id' } },
                { type: 'CONTROLLER_JOIN', payload: { joinCode } },
                { type: 'CONSOLE_CLOSE', payload: { now: true } },
                'garbage',
              ]),
            );
            break;
          }
          case 'unauthorized':
            target?.client.send(msg.consoleClose());
            target?.client.send(msg.controllerRemove(target.controllerId));
            break;
          case 'close':
            if (tv && random() < 0.2) {
              tv.send(msg.consoleClose());
              consoleOver = true;
            }
            break;
        }

        // A phone that was told its membership ended is closed, and terminal.
        for (const phone of phones) {
          if (phone.client.last('CONSOLE_ENDED')) {
            expect(phone.client.closed, where('ended ⇒ closed')).toBe(true);
            phone.over = true;
          }
        }
        if (phones.some((p) => p.client.last('CONSOLE_ENDED')?.payload.reason === 'TV_GONE')) {
          consoleOver = true;
        }

        // The TV's latest snapshot agrees with what the phones can observe.
        const snap = tv?.last('CONSOLE_UPDATED')?.payload;
        if (tv && snap && snap.state === 'OPEN') {
          const ids = snap.controllers.map((c) => c.controllerId);
          expect(new Set(ids).size, where('unique ids')).toBe(ids.length);
          expect(ids.length <= 8, where('8 controllers at most')).toBe(true);
          for (const id of ids) {
            const phone = phones.find((p) => p.controllerId === id);
            expect(phone?.over, where(`listed ${id} is not terminal`)).toBe(false);
          }
          // A phone that is not terminal and whose current connection is open is a live member.
          for (const phone of phones) {
            if (phone.over || phone.client.closed) continue;
            const entry = snap.controllers.find((c) => c.controllerId === phone.controllerId);
            expect(entry?.connection, where(`${phone.controllerId} listed as connected`)).toBe(
              'CONNECTED',
            );
          }
        }

        // Credentials: the TV never sees a phone's; a phone never sees another's.
        if (tv)
          expect(JSON.stringify(tv.received), where('TV secrecy')).not.toMatch(/RECONNECT-SECRET/);
        for (const phone of phones) {
          const seen = JSON.stringify(phone.client.received);
          for (const other of phones) {
            if (other === phone) continue;
            for (const token of [other.token, ...other.old]) {
              expect(seen.includes(token), where('phone secrecy')).toBe(false);
            }
          }
        }
        expect(rig.internalErrors, where('no internal errors')).toEqual([]);
      }

      // Terminal credentials never come back, whatever happened.
      for (const phone of phones) {
        for (const token of phone.over ? [phone.token, ...phone.old] : phone.old) {
          const client = rig.connect('controller');
          client.send(msg.controllerReconnect(joinCode, token));
          expect(
            client.last('CONTROLLER_RECONNECTED'),
            `seed ${seed}: terminal credential`,
          ).toBeUndefined();
        }
      }
      await rig.stop();
    }
  }, 120_000);
});
