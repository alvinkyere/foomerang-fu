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
  playerRumbleMessageSchema,
  roomRumbleMessageSchema,
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
  PlayerRumbleMessage,
  RoomRumbleMessage,
  RoomCreateMessage,
  RoomCreatedMessage,
  RoomUpdatedMessage,
  RosterEntry,
} from './host';

export {
  ACTIONS,
  ACTION_PHASES,
  SYSTEM_ACTIONS,
  axisSchema,
  inputEventMessageSchema,
  inputMoveMessageSchema,
} from './controller';
export type {
  Action,
  ActionPhase,
  InputAction,
  InputEventMessage,
  InputMoveMessage,
  SystemAction,
} from './controller';

export { heartbeatAckMessageSchema, heartbeatMessageSchema } from './heartbeat';
export type { HeartbeatAckMessage, HeartbeatMessage } from './heartbeat';

export {
  parseClientMessage,
  parseConsoleClientMessage,
  parseConsoleServerMessage,
  parseServerMessage,
} from './parse';
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

export {
  CONTROLLER_CONTEXTS,
  SECONDARY_ACTION_LABELS,
  controllerContextMessageSchema,
  controllerContextSetMessageSchema,
} from './context';
export type {
  ControllerContext,
  ControllerContextMessage,
  ControllerContextSetMessage,
  SecondaryAction,
  SecondaryActionLabel,
} from './context';

// Console sessions (ADR-004, Checkpoint C): additive under protocol version 1; the server adopts
// them in C3. The legacy ROOM_* flow above is unchanged.
export {
  CONSOLE_CONTROLLER,
  CONSOLE_END_REASONS,
  CONSOLE_STATES,
  EFFECTIVE_CONTEXTS,
  GAME_STATES,
  MAX_WIRE_CONTROLLERS,
  MEMBERSHIP_STATUSES,
  PARTICIPATION_STATUSES,
  consoleClientMessageSchema,
  consoleCloseMessageSchema,
  consoleEndedMessageSchema,
  consoleOpenMessageSchema,
  consoleOpenedMessageSchema,
  consoleServerMessageSchema,
  consoleStatusMessageSchema,
  consoleUpdatedMessageSchema,
  controllerIdSchema,
  controllerInputMessageSchema,
  controllerJoinMessageSchema,
  controllerJoinedMessageSchema,
  controllerLeaveMessageSchema,
  controllerReconnectMessageSchema,
  controllerReconnectedMessageSchema,
  controllerRemoveMessageSchema,
  controllerViewMessageSchema,
  controllerRumbleMessageSchema,
  rumbleMessageSchema,
  gameExitMessageSchema,
  gameLaunchMessageSchema,
  gameMatchEndMessageSchema,
  gameMatchStartMessageSchema,
  gameParticipantsMessageSchema,
  gameSessionIdSchema,
} from './console';
export type {
  ActiveGame,
  ConsoleClientMessage,
  ConsoleCloseMessage,
  ConsoleEndReason,
  ConsoleEndedMessage,
  ConsoleOpenMessage,
  ConsoleOpenedMessage,
  ConsoleServerMessage,
  ConsoleState,
  ConsoleStatusMessage,
  ConsoleUpdatedMessage,
  ControllerEntry,
  ControllerId,
  ControllerInputMessage,
  ControllerJoinMessage,
  ControllerJoinedMessage,
  ControllerLeaveMessage,
  ControllerReconnectMessage,
  ControllerReconnectedMessage,
  ControllerRemoveMessage,
  ControllerViewMessage,
  ControllerRumbleMessage,
  RumbleMessage,
  EffectiveContext,
  GameExitMessage,
  GameLaunchMessage,
  GameMatchEndMessage,
  GameMatchStartMessage,
  GameParticipantsMessage,
  GameSessionId,
  GameState,
  MembershipStatus,
  ParticipantEntry,
  ParticipantRef,
  ParticipationStatus,
} from './console';
