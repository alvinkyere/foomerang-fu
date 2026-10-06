import { z } from 'zod';
import { handshakeAcceptedMessageSchema, handshakeMessageSchema } from './client';
import { inputEventMessageSchema, inputMoveMessageSchema } from './controller';
import { errorMessageSchema, type ErrorCode } from './errors';
import { heartbeatAckMessageSchema, heartbeatMessageSchema } from './heartbeat';
import { controllerManifestMessageSchema } from './manifest';
import {
  hostReconnectMessageSchema,
  matchStartMessageSchema,
  hostReconnectedMessageSchema,
  playerInputMessageSchema,
  roomCreateMessageSchema,
  roomCreatedMessageSchema,
  roomUpdatedMessageSchema,
} from './host';
import {
  playerReconnectMessageSchema,
  playerReconnectedMessageSchema,
  roomJoinMessageSchema,
  roomJoinedMessageSchema,
} from './room';
import { isSupportedProtocolVersion } from './version';

/**
 * THE trust boundary. Everything arriving from a client passes through `parseClientMessage` and
 * becomes a typed, validated object — or an `ErrorCode`. Nothing past this point re-parses:
 * internal code carries the guarantee in its types.
 */

export type ParseResult<T> = { ok: true; message: T } | { ok: false; code: ErrorCode };

/** Messages a client may send. Server-only messages (ERROR, HEARTBEAT_ACK) are deliberately absent. */
const clientMessageSchema = z.discriminatedUnion('type', [
  handshakeMessageSchema,
  inputMoveMessageSchema,
  inputEventMessageSchema,
  heartbeatMessageSchema,
  roomCreateMessageSchema,
  hostReconnectMessageSchema,
  matchStartMessageSchema,
  roomJoinMessageSchema,
  playerReconnectMessageSchema,
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

/** Messages the server may send. A client can never forge these because it cannot send them. */
const serverMessageSchema = z.discriminatedUnion('type', [
  errorMessageSchema,
  heartbeatAckMessageSchema,
  handshakeAcceptedMessageSchema,
  roomCreatedMessageSchema,
  hostReconnectedMessageSchema,
  roomJoinedMessageSchema,
  playerReconnectedMessageSchema,
  roomUpdatedMessageSchema,
  playerInputMessageSchema,
  controllerManifestMessageSchema,
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

const invalid = { ok: false, code: 'INVALID_MESSAGE' } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A handshake claiming a well-formed but unsupported protocol version gets UNSUPPORTED_PROTOCOL
 * even if the rest of its payload has a shape we don't know (a future client may have changed it).
 */
function isUnsupportedHandshake(raw: unknown): boolean {
  if (!isRecord(raw) || raw['type'] !== 'HANDSHAKE') return false;
  const payload = raw['payload'];
  if (!isRecord(payload)) return false;
  const version = payload['protocolVersion'];
  return (
    typeof version === 'number' &&
    Number.isSafeInteger(version) &&
    version >= 1 &&
    !isSupportedProtocolVersion(version)
  );
}

/** Never throws, whatever it is given. */
export function parseClientMessage(raw: unknown): ParseResult<ClientMessage> {
  try {
    if (isUnsupportedHandshake(raw)) return { ok: false, code: 'UNSUPPORTED_PROTOCOL' };
    const result = clientMessageSchema.safeParse(raw);
    return result.success ? { ok: true, message: result.data } : invalid;
  } catch {
    return invalid; // e.g. throwing getters, revoked proxies
  }
}

/** Never throws. For clients validating what the server sends (dev builds, native clients). */
export function parseServerMessage(raw: unknown): ParseResult<ServerMessage> {
  try {
    const result = serverMessageSchema.safeParse(raw);
    return result.success ? { ok: true, message: result.data } : invalid;
  } catch {
    return invalid;
  }
}
