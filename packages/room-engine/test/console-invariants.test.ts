import { CONTROLLER_CONTEXTS, type ControllerContext } from '@foomerang/protocol';
import { describe, expect, it } from 'vitest';
import { effectiveContext, mayPause, participationOf, type ConsoleSession } from '../src/console';
import { ConsoleRegistry } from '../src/consoleRegistry';
import type { ControllerId, GameSessionId } from '../src/ids';
import { createFakeConsoleEnvironment } from './support/fakeConsoleEnvironment';

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

const OPS = [
  'join',
  'join',
  'drop',
  'reconnect',
  'staleReconnect',
  'leave',
  'remove',
  'hostDrop',
  'hostBack',
  'launch',
  'seat',
  'begin',
  'play',
  'context',
  'finish',
  'lobby',
  'exit',
  'staleGame',
  'close',
] as const;

describe('console-session invariants hold over arbitrary operation sequences', () => {
  const SEQUENCES = 150;
  const STEPS = 90;

  it(`${SEQUENCES} random sequences × ${STEPS} operations (seeded, replayable)`, () => {
    for (let seed = 1; seed <= SEQUENCES; seed += 1) {
      const random = mulberry32(seed);
      const pick = <T>(items: readonly T[]): T | undefined =>
        items[Math.floor(random() * items.length)];
      const choose = <T>(items: readonly [T, ...T[]]): T => pick(items) ?? items[0];
      const env = createFakeConsoleEnvironment();
      const registry = new ConsoleRegistry(env);
      const opened = registry.open();
      if (!opened.ok) throw new Error('setup');
      const { consoleId, joinCode } = opened.value;

      const tokens = new Map<ControllerId, string>();
      const superseded = new Set<string>();
      let hostToken = opened.value.host.hostToken.reveal();
      const supersededHost = new Set<string>();
      const identity = new Map<ControllerId, { name: string; joinedAt: number }>();
      const released = new Set<ControllerId>();
      const games = new Set<GameSessionId>();
      const exitedGames: GameSessionId[] = [];
      let order: ControllerId[] = [];
      let version = 1;

      for (let step = 0; step < STEPS; step += 1) {
        env.time += choose([
          0, 0, 1, 500, 3_000, 9_999, 10_000, 50_000, 60_000, 600_000, 1_200_000,
        ]);
        registry.reconcile();
        const before = registry.get(consoleId);
        if (before === undefined) break;
        const where = (op: string) => `seed ${seed}, step ${step} (${op})`;
        const game = before.activeGame?.gameSessionId;
        const target = pick(before.controllers)?.controllerId;
        const op = choose(OPS as unknown as [string, ...string[]]);

        switch (op) {
          case 'join': {
            const r = registry.join(joinCode, `P${step}`);
            if (r.ok)
              tokens.set(
                r.value.controller.controllerId,
                r.value.controller.reconnectToken.reveal(),
              );
            break;
          }
          case 'drop':
            if (target) registry.disconnectController(consoleId, target);
            break;
          case 'reconnect':
            if (target) {
              const old = tokens.get(target) ?? '';
              const r = registry.reconnectController(consoleId, old);
              if (r.ok) {
                superseded.add(old);
                tokens.set(target, r.value.controller.reconnectToken.reveal());
              }
            }
            break;
          case 'staleReconnect': {
            const old = pick([...superseded]);
            if (old !== undefined) {
              expect(registry.reconnectController(consoleId, old).ok, where(op)).toBe(false);
            }
            break;
          }
          case 'leave':
          case 'remove':
            if (target)
              registry.releaseController(consoleId, target, op === 'leave' ? 'LEFT' : 'REMOVED');
            break;
          case 'hostDrop':
            registry.disconnectHost(consoleId);
            break;
          case 'hostBack': {
            const stale = pick([...supersededHost]);
            if (stale !== undefined && random() < 0.3) {
              expect(registry.reconnectHost(consoleId, stale).ok, where('stale host')).toBe(false);
            }
            const r = registry.reconnectHost(consoleId, hostToken);
            if (r.ok) {
              supersededHost.add(hostToken);
              hostToken = r.value.session.host.hostToken.reveal();
            }
            break;
          }
          case 'launch': {
            const r = registry.launchGame(consoleId, {
              gameId: 'foomerang-fu',
              minPlayers: 0,
              maxPlayers: 6,
            });
            if (r.ok) {
              const id = r.value.game.gameSessionId;
              expect(games.has(id), where('game ids are never reused')).toBe(false);
              games.add(id);
            }
            break;
          }
          case 'seat':
            if (game) {
              const held = before.controllers.filter((c) => c.membership.status === 'HELD');
              const subset = held.filter(() => random() < 0.6).map((c) => c.controllerId);
              registry.setParticipants(consoleId, game, subset);
            }
            break;
          case 'begin':
            if (game) registry.beginMatch(consoleId, game);
            break;
          case 'play':
            if (game) registry.startPlaying(consoleId, game);
            break;
          case 'context':
            registry.setContext(
              consoleId,
              choose([...CONTROLLER_CONTEXTS] as [ControllerContext, ...ControllerContext[]]),
              null,
            );
            break;
          case 'finish':
            if (game) registry.finishMatch(consoleId, game);
            break;
          case 'lobby':
            if (game) registry.returnGameToLobby(consoleId, game);
            break;
          case 'exit':
            if (game && registry.exitGame(consoleId, game).ok) exitedGames.push(game);
            break;
          case 'staleGame': {
            const old = pick(exitedGames);
            if (old !== undefined) {
              const after = registry.get(consoleId);
              expect(registry.beginMatch(consoleId, old).ok, where(op)).toBe(false);
              expect(registry.setParticipants(consoleId, old, []).ok, where(op)).toBe(false);
              expect(registry.get(consoleId), where('stale game changes nothing')).toBe(after);
            }
            break;
          }
          case 'close':
            if (random() < 0.15) registry.beginClose(consoleId);
            break;
        }

        const s: ConsoleSession | undefined = registry.get(consoleId);
        if (s === undefined) break;
        const label = where(op);

        // connection × membership
        for (const c of s.controllers) {
          if (c.connection.status === 'CONNECTED') expect(c.membership.status, label).toBe('HELD');
          if (c.membership.status === 'RELEASED') {
            expect(c.connection.status, label).toBe('DISCONNECTED');
            released.add(c.controllerId);
          } else {
            expect(released.has(c.controllerId), `${label}: RELEASED is permanent`).toBe(false);
          }
          const seen = identity.get(c.controllerId);
          if (seen) expect({ name: c.displayName, joinedAt: c.joinedAt }, label).toEqual(seen);
          else identity.set(c.controllerId, { name: c.displayName, joinedAt: c.joinedAt });
        }
        const ids = s.controllers.map((c) => c.controllerId);
        expect(ids.slice(0, order.length), `${label}: controllers only ever appended`).toEqual(
          order,
        );
        order = ids;
        const held = s.controllers.filter((c) => c.membership.status === 'HELD');
        expect(held.length <= 8, `${label}: console capacity`).toBe(true);

        // participants
        const participants = s.activeGame?.participants ?? [];
        expect(new Set(participants).size, `${label}: unique`).toBe(participants.length);
        expect(participants.length <= 6, `${label}: game capacity`).toBe(true);
        for (const p of participants) {
          expect(
            held.some((c) => c.controllerId === p),
            `${label}: participant is a member`,
          ).toBe(true);
        }
        const running =
          before.activeGame !== null &&
          before.activeGame.state === 'PLAYING' &&
          (before.context.value === 'GAMEPLAY' || before.context.value === 'PAUSED');
        if (running && s.activeGame?.gameSessionId === before.activeGame?.gameSessionId) {
          for (const p of participants) {
            expect(
              before.activeGame?.participants.includes(p),
              `${label}: nobody is promoted during a running match`,
            ).toBe(true);
          }
        }

        // context
        if (s.context.value !== 'CONSOLE') {
          expect(s.activeGame?.state, `${label}: non-CONSOLE only while playing`).toBe('PLAYING');
        }
        expect(s.context.version >= version, `${label}: version never goes back`).toBe(true);
        version = s.context.version;
        for (const c of s.controllers) {
          const participation = participationOf(s, c.controllerId);
          if (effectiveContext(s, c.controllerId) === 'WAITING') {
            expect(participation, label).toBe('WAITING');
          }
          if (mayPause(s, c.controllerId)) expect(participation, label).toBe('PARTICIPANT');
        }

        // credentials
        for (const old of superseded) {
          expect(
            registry.identifyController(consoleId, old),
            `${label}: old credential`,
          ).toBeUndefined();
        }
        for (const old of supersededHost) {
          expect(registry.isHost(consoleId, old), `${label}: old host credential`).toBe(false);
        }

        // closing
        if (s.state !== 'OPEN') {
          expect(held, `${label}: a closing console holds nobody`).toEqual([]);
          expect(s.activeGame, label).toBeNull();
          expect(registry.join(joinCode, 'late').ok, label).toBe(false);
          break;
        }
      }
    }
  });
});
