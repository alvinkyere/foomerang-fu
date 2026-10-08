import type { ControllerViewMessage, ControllerInputMessage } from '@foomerang/protocol';
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

type View = ControllerViewMessage['payload'];
interface Phone {
  client: FakeClient;
  controllerId: string;
  token: string;
  gone: boolean;
}

const OPS = [
  'join',
  'launch',
  'seat',
  'seat',
  'badSeat',
  'start',
  'context',
  'context',
  'staleContext',
  'end',
  'exit',
  'staleGame',
  'move',
  'move',
  'press',
  'press',
  'menu',
  'menu',
  'release',
  'reconnect',
  'leave',
  'time',
] as const;

describe('routing and view invariants over arbitrary interleavings (seeded, replayable)', () => {
  const SEQUENCES = 80;
  const STEPS = 80;

  it(`${SEQUENCES} sequences × ${STEPS} operations`, async () => {
    for (let seed = 1; seed <= SEQUENCES; seed += 1) {
      const random = mulberry32(seed);
      const pick = <T>(items: readonly T[]): T | undefined =>
        items[Math.floor(random() * items.length)];
      const generous = { burst: 1_000_000, refillPerSecond: 1_000_000 };
      const rig = createRig({
        rateLimits: { room: generous, action: generous, movement: generous },
      });
      await rig.start();
      const { client: tv, joinCode } = rig.console();
      const phones: Phone[] = [];
      const pastGames: string[] = [];
      let seq = 0;
      let ev = 0;
      let moveSeq = 0;
      let routedSoFar = 0;
      let lastMenu: { at: number; versions: string } | undefined;

      const snapshotNow = () => tv.last('CONSOLE_UPDATED')?.payload;
      const currentGame = () => snapshotNow()?.game?.gameSessionId ?? null;
      const viewOf = (p: Phone) => p.client.last('CONTROLLER_CONTEXT')?.payload as View | undefined;
      const live = () => phones.filter((p) => !p.gone && !p.client.closed);
      const versions = () => JSON.stringify(live().map((p) => viewOf(p)?.version));

      for (let step = 0; step < STEPS; step += 1) {
        const where = (op: string) => `seed ${seed}, step ${step} (${op})`;
        const op = pick(OPS) ?? 'move';
        const game = currentGame();
        const target = pick(live());
        // what the sender's view was when it sent (views are delivered synchronously here)
        const senderView = target ? viewOf(target) : undefined;
        const versionsBefore = versions();

        switch (op) {
          case 'join': {
            if (phones.length >= 10) break;
            const client = rig.connect('controller');
            client.send(msg.controllerJoin(joinCode, `P${phones.length + 1}`));
            const joined = client.last('CONTROLLER_JOINED');
            if (joined) {
              phones.push({
                client,
                controllerId: joined.payload.controllerId,
                token: joined.payload.reconnectToken,
                gone: false,
              });
            }
            break;
          }
          case 'launch':
            tv.send(msg.gameLaunch());
            break;
          case 'seat':
          case 'badSeat':
            if (game) {
              const chosen = live()
                .filter(() => random() < 0.6)
                .slice(0, 6);
              const seats = [1, 2, 3, 4, 5, 6].sort(() => random() - 0.5);
              tv.send(
                msg.gameParticipants(
                  (seq += 1),
                  game,
                  chosen.map((p, i) => ({
                    controllerId: op === 'badSeat' && i === 0 ? 'controller-404' : p.controllerId,
                    seat: seats[i] ?? 1,
                  })),
                ),
              );
            }
            break;
          case 'start':
            if (game) tv.send(msg.gameMatchStart(game));
            break;
          case 'context':
            tv.send(
              msg.tvContext(
                (seq += 1),
                pick(['CONSOLE', 'GAMEPLAY', 'PAUSED', 'RESULTS'] as const) ?? 'CONSOLE',
                game,
              ),
            );
            break;
          case 'staleContext': {
            const old = pick(pastGames);
            if (old) tv.send(msg.tvContext((seq += 1), 'PAUSED', old));
            break;
          }
          case 'end':
            if (game) tv.send(msg.gameMatchEnd(game));
            break;
          case 'exit':
            if (game) {
              tv.send(msg.gameExit(game));
              pastGames.push(game);
            }
            break;
          case 'staleGame': {
            const old = pick(pastGames);
            const victim = live()[0];
            if (old) {
              const before = JSON.stringify(snapshotNow());
              tv.send(msg.gameMatchStart(old));
              if (victim)
                tv.send(
                  msg.gameParticipants((seq += 1), old, [
                    { controllerId: victim.controllerId, seat: 1 },
                  ]),
                );
              tv.send(msg.gameExit(old));
              expect(JSON.stringify(snapshotNow()), where('a past launch changes nothing')).toBe(
                before,
              );
            }
            break;
          }
          case 'move':
            target?.client.send(msg.move((moveSeq += 1), random() * 2 - 1, random() * 2 - 1));
            break;
          case 'press':
            target?.client.send(
              msg.action(
                `ev-${(ev += 1)}-pad`,
                pick(['PRIMARY', 'SECONDARY', 'TERTIARY'] as const) ?? 'PRIMARY',
              ),
            );
            break;
          case 'menu':
            target?.client.send(msg.action(`ev-${(ev += 1)}-pad`, 'MENU'));
            break;
          case 'release':
            target?.client.send(
              msg.action(
                `ev-${(ev += 1)}-pad`,
                pick(['PRIMARY', 'MENU'] as const) ?? 'MENU',
                'released',
              ),
            );
            break;
          case 'reconnect':
            if (target) {
              const client = rig.connect('controller');
              client.send(msg.controllerReconnect(joinCode, target.token));
              const back = client.last('CONTROLLER_RECONNECTED');
              if (back) {
                target.token = back.payload.reconnectToken;
                target.client = client;
                moveSeq = 0; // a new connection starts its own movement stream
              }
            }
            break;
          case 'leave':
            if (target) {
              target.client.send(msg.controllerLeave());
              target.gone = true;
            }
            break;
          case 'time':
            rig.advance(pick([0, 100, 299, 300, 1_000]) ?? 0);
            break;
        }

        // ---- routed input: every new CONTROLLER_INPUT is lawful --------------------------------
        const routed = tv
          .all('CONTROLLER_INPUT')
          .map((m) => m.payload as ControllerInputMessage['payload']);
        for (const input of routed.slice(routedSoFar)) {
          const label = where(`routed ${input.input.kind} from ${input.controllerId}`);
          expect(input.controllerId, label).toBe(target?.controllerId); // only the sender, never another
          expect(senderView?.context, label).not.toBe('WAITING');
          expect(input.gameSessionId, label).toBe(game);
          if (
            input.input.kind === 'ACTION' &&
            input.input.action === 'MENU' &&
            input.input.phase === 'pressed'
          ) {
            expect(senderView?.participation?.status, `${label}: pause authority`).toBe(
              'PARTICIPANT',
            );
            expect(['GAMEPLAY', 'PAUSED'], `${label}: pause only in a match`).toContain(
              senderView?.context,
            );
            if (lastMenu !== undefined && lastMenu.versions === versionsBefore) {
              expect(rig.env.time - lastMenu.at >= 300, `${label}: one toggle per moment`).toBe(
                true,
              );
            }
            lastMenu = { at: rig.env.time, versions: versionsBefore };
          }
        }
        routedSoFar = routed.length;

        // ---- views: monotonic, consistent, controls before meaning -----------------------------
        for (const phone of live()) {
          const views = phone.client.all('CONTROLLER_CONTEXT').map((m) => m.payload as View);
          for (let i = 1; i < views.length; i += 1) {
            expect(
              (views[i]?.version ?? 0) > (views[i - 1]?.version ?? 0),
              where('view versions rise'),
            ).toBe(true);
          }
          const latest = views.at(-1);
          if (latest?.participation?.status === 'PARTICIPANT') {
            const types = phone.client.received.map((m) => m.type);
            const viewAt = types.lastIndexOf('CONTROLLER_CONTEXT');
            const manifestAt = types.lastIndexOf('CONTROLLER_MANIFEST');
            expect(
              manifestAt >= 0 && manifestAt < viewAt,
              where('manifest before participant view'),
            ).toBe(true);
            expect(
              latest.participation.gameSessionId,
              where('participation is in the current launch'),
            ).toBe(currentGame());
          }
        }

        // ---- the TV's snapshot ---------------------------------------------------------------
        const snap = snapshotNow();
        if (snap?.game) {
          expect(snap.game.participants.length <= 6, where('capacity')).toBe(true);
          expect(
            snap.game.participants.every((p) => p.seat >= 1 && p.seat <= 6),
            where('seats'),
          ).toBe(true);
        }
        expect(JSON.stringify(tv.received), where('TV secrecy')).not.toMatch(/RECONNECT-SECRET/);
        expect(rig.internalErrors, where('no internal errors')).toEqual([]);
      }
      await rig.stop();
    }
  }, 120_000);
});
