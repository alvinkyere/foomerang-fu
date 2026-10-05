import type { ClientType, ServerMessage } from '@foomerang/protocol';
import type { HostId, PlayerId, RoomId } from '@foomerang/room-engine';
import { TokenBucket, type MessageClass, type RateLimits } from './rateLimit';
import type { TransportConnection } from './transport';

/**
 *   UNNEGOTIATED ──valid HANDSHAKE──► ACTIVE ──close──► CLOSED
 *        └──invalid / unsupported / timeout / abuse──► REJECTED ──► CLOSED
 */
export type SessionLifecycle = 'UNNEGOTIATED' | 'ACTIVE' | 'REJECTED' | 'CLOSED';

/**
 * WHO a connection is allowed to act as. Established only by a credential, never inferred from the
 * socket id, address, display name or join code. `generation` identifies this particular binding:
 * if a newer connection takes the identity over, this one's generation is no longer current.
 */
export type SessionIdentity =
  | {
      readonly kind: 'PLAYER';
      readonly roomId: RoomId;
      readonly playerId: PlayerId;
      readonly generation: number;
    }
  | {
      readonly kind: 'HOST';
      readonly roomId: RoomId;
      readonly hostId: HostId;
      readonly generation: number;
    };

/** Everything the server knows about one transport connection. Distinct from the transport AND from the room domain. */
export class Session {
  readonly connectionId: string;
  lifecycle: SessionLifecycle = 'UNNEGOTIATED';
  clientType: ClientType | undefined = undefined;
  identity: SessionIdentity | undefined = undefined;
  /**
   * Last accepted movement sequence number. Scoped to THIS connection: a reconnecting controller
   * is a new connection and may start again from 0.
   */
  lastMovementSeq = -1;
  droppedMessages = 0;
  invalidMessages = 0;

  readonly #connection: TransportConnection;
  readonly #buckets: Record<MessageClass, TokenBucket>;

  constructor(connection: TransportConnection, limits: RateLimits) {
    this.connectionId = connection.id;
    this.#connection = connection;
    this.#buckets = {
      handshake: new TokenBucket(limits.handshake),
      room: new TokenBucket(limits.room),
      movement: new TokenBucket(limits.movement),
      action: new TokenBucket(limits.action),
      heartbeat: new TokenBucket(limits.heartbeat),
      other: new TokenBucket(limits.other),
    };
  }

  /** Charges one message against its class budget. */
  admit(messageClass: MessageClass, nowMs: number): boolean {
    return this.#buckets[messageClass].tryTake(nowMs);
  }

  send(message: ServerMessage): void {
    if (this.lifecycle === 'CLOSED') return;
    try {
      this.#connection.send(message);
    } catch {
      // A dying socket must never take the server down with it.
    }
  }

  close(): void {
    try {
      this.#connection.close();
    } catch {
      // See above.
    }
  }
}
