import { describe, expect, it } from 'vitest';
import { RoomRegistry } from '../src/registry';
import type { PlayerId } from '../src/ids';
import type { Room } from '../src/room';
import { createFakeEnvironment } from './support/fakeEnvironment';
import { FOOMERANG_FU } from './support/rooms';

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

describe('lifecycle invariants hold over arbitrary operation sequences', () => {
  const SEQUENCES = 150;
  const STEPS = 80;

  it(`${SEQUENCES} random sequences × ${STEPS} operations (seeded, replayable)`, () => {
    for (let seed = 1; seed <= SEQUENCES; seed += 1) {
      const random = mulberry32(seed);
      const pick = <T>(items: readonly T[]): T | undefined =>
        items[Math.floor(random() * items.length)];
      // For non-empty literals: always returns a member.
      const choose = <T>(items: readonly [T, ...T[]]): T => pick(items) ?? items[0];
      const env = createFakeEnvironment();
      env.time = 1_000;
      const registry = new RoomRegistry(env);
      const created = registry.createRoom(FOOMERANG_FU);
      if (!created.ok) throw new Error('setup');
      const { roomId, joinCode } = created.value;
      const hostId = created.value.host.hostId;

      const supersededPlayerTokens = new Set<string>();
      const supersededHostTokens: string[] = [];
      const everSeen = new Map<PlayerId, { displayName: string; joinedAt: number }>();
      const everReleased = new Set<PlayerId>();
      let previousOrder: PlayerId[] = [];

      const room = (): Room => {
        const r = registry.getRoom(roomId);
        if (!r) throw new Error('room vanished');
        return r;
      };
      const where = (step: number, op: string) => `seed ${seed}, step ${step} (${op})`;

      for (let step = 0; step < STEPS; step += 1) {
        // Time only moves forward, and often lands exactly on a boundary.
        const jump = choose([0, 0, 500, 3_000, 9_999, 1, 10_000, 25_000, 49_999, 60_000, 1]);
        env.time += jump;

        const current = room();
        const target = pick(current.players);
        const op = choose([
          'join',
          'drop',
          'reconnect',
          'staleReconnect',
          'hostDrop',
          'hostReconnect',
          'sweep',
          'garbage',
          'start',
        ] as const);

        if (op === 'join') {
          registry.joinRoom(roomId, `p${step}`);
        } else if (op === 'drop' && target) {
          registry.disconnectPlayer(roomId, target.playerId);
        } else if (op === 'reconnect' && target) {
          const old = target.reconnectToken.reveal();
          const result = registry.reconnectPlayer(roomId, old);
          if (result.ok) supersededPlayerTokens.add(old);
        } else if (op === 'staleReconnect') {
          const stale = pick([...supersededPlayerTokens]);
          if (stale !== undefined) {
            const result = registry.reconnectPlayer(roomId, stale);
            expect(result.ok, where(step, 'stale token must never work')).toBe(false);
          }
        } else if (op === 'hostDrop') {
          registry.disconnectHost(roomId);
        } else if (op === 'hostReconnect') {
          const old = current.host.hostToken.reveal();
          if (registry.reconnectHost(roomId, old).ok) supersededHostTokens.push(old);
        } else if (op === 'sweep') {
          registry.reconcile();
        } else if (op === 'garbage') {
          expect(registry.reconnectPlayer(roomId, `garbage-${step}`).ok).toBe(false);
          expect(registry.reconnectHost(roomId, `garbage-${step}`).ok).toBe(false);
        } else if (op === 'start' && step % 17 === 0) {
          registry.beginStart(roomId); // may succeed or fail; must never corrupt
        }

        // ---- invariants ----
        const r = room();
        const label = where(step, op);

        // Identity of the room and host is immutable.
        expect(r.roomId, label).toBe(roomId);
        expect(r.joinCode, label).toBe(joinCode);
        expect(r.host.hostId, label).toBe(hostId);

        // Capacity: occupancy never exceeds configuration.
        const occupied = r.players.filter((p) => p.membership.status === 'HELD').length;
        expect(occupied, label).toBeLessThanOrEqual(FOOMERANG_FU.maxPlayers);

        for (const p of r.players) {
          // Connection and membership are independent facts, but constrained.
          if (p.connection.status === 'CONNECTED') {
            expect(p.membership.status, `${label}: CONNECTED ⇒ HELD`).toBe('HELD');
          }
          if (p.membership.status === 'RELEASED') {
            expect(p.connection.status, `${label}: RELEASED ⇒ DISCONNECTED`).toBe('DISCONNECTED');
            everReleased.add(p.playerId);
          }
          if (p.connection.status !== 'CONNECTED') {
            expect(p.connection.disconnectedAt, label).toBeLessThanOrEqual(env.time);
          }
          // A released seat never comes back.
          if (everReleased.has(p.playerId)) {
            expect(p.membership.status, `${label}: RELEASED is permanent`).toBe('RELEASED');
          }
          // Identity never changes.
          const known = everSeen.get(p.playerId);
          if (known) {
            expect(p.displayName, label).toBe(known.displayName);
            expect(p.joinedAt, label).toBe(known.joinedAt);
          }
          everSeen.set(p.playerId, { displayName: p.displayName, joinedAt: p.joinedAt });
        }

        // Participants are never deleted or reordered; new ones only append.
        const order = r.players.map((p) => p.playerId);
        expect(order.slice(0, previousOrder.length), label).toEqual(previousOrder);
        previousOrder = order;

        // All PlayerIds and all live credentials are unique.
        expect(new Set(order).size, label).toBe(order.length);
        const credentials = [
          ...r.players.map((p) => p.reconnectToken.reveal()),
          r.host.hostToken.reveal(),
        ];
        expect(new Set(credentials).size, label).toBe(credentials.length);

        // Superseded credentials never authenticate again.
        for (const dead of supersededPlayerTokens) {
          expect(
            registry.identifyPlayer(roomId, dead),
            `${label}: dead player token`,
          ).toBeUndefined();
        }
        for (const dead of supersededHostTokens) {
          expect(registry.isHost(roomId, dead), `${label}: dead host token`).toBe(false);
        }
      }
    }
  }, 60_000); // CPU-bound by design; a loaded cold checkout took 9 s against vitest's 5 s default (assertions unchanged)
});
