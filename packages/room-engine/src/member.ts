import type { ReconnectToken } from './credential';
import { fail, ok, type Result } from './result';
import type { Connection, Membership } from './room';
import { elapsedSince } from './timing';

/**
 * The connection / membership lifecycle shared by a legacy room's players and a console session's
 * controllers: two independent facts (CONNECTED ⇒ HELD, RELEASED ⇒ DISCONNECTED), driven by an
 * injected monotonic clock, never by timers.
 */
export interface Member {
  readonly reconnectToken: ReconnectToken;
  readonly joinedAt: number;
  readonly connection: Connection;
  readonly membership: Membership;
}

export interface MemberTimings {
  readonly reconnectingWindowMs: number;
  /** How long a lost member keeps its place (a room's seat, a console's membership). */
  readonly reservationMs: number;
}

export function reconcileConnection(
  connection: Connection,
  now: number,
  reconnectingWindowMs: number,
): { connection: Connection; elapsed: number } | undefined {
  if (connection.status === 'CONNECTED') return undefined;
  const elapsed = elapsedSince(connection.disconnectedAt, now); // throws if the clock went backwards
  const status = elapsed >= reconnectingWindowMs ? 'DISCONNECTED' : 'RECONNECTING';
  return {
    elapsed,
    connection:
      status === connection.status
        ? connection
        : Object.freeze({ status, disconnectedAt: connection.disconnectedAt }),
  };
}

/** Brings one member up to date as of `now`; returns the SAME object when nothing changed. */
export function reconcileMember<T extends Member>(
  member: T,
  now: number,
  timings: MemberTimings,
): T {
  // RELEASED is terminal and its connection is terminally DISCONNECTED: never recompute it (a
  // member released at once, by leaving or removal, would otherwise drift back to RECONNECTING).
  if (member.membership.status === 'RELEASED') return member;
  const settled = reconcileConnection(member.connection, now, timings.reconnectingWindowMs);
  if (settled === undefined) return member;

  let membership: Membership = member.membership;
  if (membership.status === 'HELD' && settled.elapsed >= timings.reservationMs) {
    // Logical release time, independent of how late the server happened to notice.
    const disconnectedAt = (member.connection as { disconnectedAt: number }).disconnectedAt;
    membership = Object.freeze({
      status: 'RELEASED',
      releasedAt: disconnectedAt + timings.reservationMs,
    });
  }
  if (settled.connection === member.connection && membership === member.membership) return member;
  return Object.freeze({ ...member, connection: settled.connection, membership });
}

/** The transport is gone: starts the reconnecting clock. A repeat does NOT restart it. */
export function dropMember<T extends Member>(
  member: T,
  now: number,
): Result<T, 'ALREADY_DISCONNECTED'> {
  elapsedSince(member.joinedAt, now); // a clock earlier than the join is a violated contract
  if (member.connection.status !== 'CONNECTED') return fail('ALREADY_DISCONNECTED');
  return ok(
    Object.freeze({
      ...member,
      connection: Object.freeze({ status: 'RECONNECTING', disconnectedAt: now }),
    }),
  );
}

/** Gives the place up at once (left, removed, closed). Permanent; keeps an existing disconnect time. */
export function releaseMember<T extends Member>(member: T, now: number): T {
  const connection: Connection =
    member.connection.status === 'CONNECTED'
      ? Object.freeze({ status: 'DISCONNECTED', disconnectedAt: now })
      : Object.freeze({ status: 'DISCONNECTED', disconnectedAt: member.connection.disconnectedAt });
  return Object.freeze({
    ...member,
    connection,
    membership: Object.freeze({ status: 'RELEASED', releasedAt: now }),
  });
}
