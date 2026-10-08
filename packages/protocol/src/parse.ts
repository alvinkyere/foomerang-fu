import { z } from 'zod';
import {
  consoleClientMessageSchema,
  consoleCloseMessageSchema,
  consoleOpenMessageSchema,
  consoleServerMessageSchema,
  controllerJoinMessageSchema,
  controllerLeaveMessageSchema,
  controllerReconnectMessageSchema,
  controllerRemoveMessageSchema,
  type ConsoleClientMessage,
  type ConsoleServerMessage,
} from './console';
import { controllerContextMessageSchema, controllerContextSetMessageSchema } from './context';
import { handshakeAcceptedMessageSchema, handshakeMessageSchema } from './client';
import { inputEventMessageSchema, inputMoveMessageSchema } from './controller';
import { errorMessageSchema, type ErrorCode } from './errors';
import { heartbeatAckMessageSchema, heartbeatMessageSchema } from './heartbeat';
import { controllerManifestMessageSchema } from './manifest';
import {
  hostReconnectMessageSchema,
  matchEndMessageSchema,
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
  matchEndMessageSchema,
  controllerContextSetMessageSchema,
  roomJoinMessageSchema,
  playerReconnectMessageSchema,
  // Console-session lifecycle (ADR-004), served since C3. The game operations (GAME_*, game-scoped
  // MATCH_*) are adopted with their handlers in C4.
  consoleOpenMessageSchema,
  consoleCloseMessageSchema,
  controllerRemoveMessageSchema,
  controllerJoinMessageSchema,
  controllerReconnectMessageSchema,
  controllerLeaveMessageSchema,
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
  controllerContextMessageSchema,
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
  return parseClient(clientMessageSchema, raw);
}

/**
 * The console-session flow's trust boundary (ADR-004): same rules (the version is negotiated once,
 * in the handshake; anything malformed is INVALID_MESSAGE; never throws) over the console flow's
 * own messages. Not used by the server until C3.
 */
export function parseConsoleClientMessage(raw: unknown): ParseResult<ConsoleClientMessage> {
  return parseClient(consoleClientMessageSchema, raw);
}

/** Never throws. For phones and TVs validating what the server sends in the console flow. */
export function parseConsoleServerMessage(raw: unknown): ParseResult<ConsoleServerMessage> {
  try {
    const result = consoleServerMessageSchema.safeParse(raw);
    return result.success ? { ok: true, message: result.data } : invalid;
  } catch {
    return invalid;
  }
}

function parseClient<T>(schema: z.ZodType<T>, raw: unknown): ParseResult<T> {
  try {
    if (isUnsupportedHandshake(raw)) return { ok: false, code: 'UNSUPPORTED_PROTOCOL' };
    const result = schema.safeParse(raw);
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
