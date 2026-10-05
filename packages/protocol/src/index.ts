// Public API of @foomerang/protocol. Keep this list deliberate: test/public-api.test.ts guards it.
// Envelope builders are internal on purpose.

export { PROTOCOL_VERSION, isSupportedProtocolVersion } from './version';

export { ERROR_CODES, errorCodeSchema, errorMessageSchema } from './errors';
export type { ErrorCode, ErrorMessage } from './errors';

export { SEQ_MAX, eventIdSchema, seqSchema } from './envelope';

export {
  CLIENT_TYPES,
  clientTypeSchema,
  clientVersionSchema,
  handshakeMessageSchema,
  handshakePayloadSchema,
} from './client';
export type { ClientType, HandshakeMessage, HandshakePayload } from './client';

export { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, joinCodeSchema } from './room';
export type { JoinCode } from './room';

export {
  ACTIONS,
  ACTION_PHASES,
  axisSchema,
  inputEventMessageSchema,
  inputMoveMessageSchema,
} from './controller';
export type { Action, ActionPhase, InputEventMessage, InputMoveMessage } from './controller';

export { heartbeatAckMessageSchema, heartbeatMessageSchema } from './heartbeat';
export type { HeartbeatAckMessage, HeartbeatMessage } from './heartbeat';

export { parseClientMessage, parseServerMessage } from './parse';
export type { ClientMessage, ParseResult, ServerMessage } from './parse';
