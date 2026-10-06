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
  handshakeAcceptedMessageSchema,
  handshakeMessageSchema,
  handshakePayloadSchema,
} from './client';
export type {
  ClientType,
  HandshakeAcceptedMessage,
  HandshakeMessage,
  HandshakePayload,
} from './client';

export {
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  joinCodeSchema,
  playerReconnectMessageSchema,
  playerReconnectedMessageSchema,
  roomJoinMessageSchema,
  roomJoinedMessageSchema,
} from './room';
export type {
  JoinCode,
  PlayerReconnectMessage,
  PlayerReconnectedMessage,
  RoomJoinMessage,
  RoomJoinedMessage,
} from './room';

export {
  CONNECTION_STATUSES,
  ROOM_STATES,
  SEAT_STATUSES,
  hostReconnectMessageSchema,
  hostReconnectedMessageSchema,
  matchEndMessageSchema,
  matchStartMessageSchema,
  playerInputMessageSchema,
  roomCreateMessageSchema,
  roomCreatedMessageSchema,
  roomUpdatedMessageSchema,
} from './host';
export type {
  HostReconnectMessage,
  HostReconnectedMessage,
  MatchEndMessage,
  MatchStartMessage,
  PlayerInputMessage,
  RoomCreateMessage,
  RoomCreatedMessage,
  RoomUpdatedMessage,
  RosterEntry,
} from './host';

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

export {
  CONTROLLER_ORIENTATIONS,
  CONTROL_TYPES,
  controllerManifestMessageSchema,
  controllerManifestSchema,
} from './manifest';
export type {
  ControlDescriptor,
  ControlType,
  ControllerManifest,
  ControllerManifestMessage,
  ControllerOrientation,
} from './manifest';
