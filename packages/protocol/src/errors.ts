import { z } from 'zod';
import { plainEnvelope } from './envelope';

/**
 * Stable, machine-readable error codes. Renaming or removing a code is a breaking wire change;
 * adding one is additive. Consumer-facing copy ("This game is full.") lives in the clients,
 * never here: protocol semantics are not UI text.
 */
export const ERROR_CODES = [
  'INVALID_MESSAGE',
  'UNSUPPORTED_PROTOCOL',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'INVALID_RECONNECT_TOKEN',
  'RATE_LIMITED',
  'UNAUTHORIZED',
  'ROOM_NOT_JOINABLE',
  'INVALID_DISPLAY_NAME',
  'SEAT_RELEASED',
  'ROOM_CLOSING',
  'UNKNOWN_GAME',
  'HANDSHAKE_REQUIRED',
  'INTERNAL_ERROR',
  'NOT_ENOUGH_PLAYERS',
  'INVALID_STATE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorCodeSchema = z.enum(ERROR_CODES);

/** Server → client. Carries only the code: consumer-facing copy is the client's job. */
export const errorMessageSchema = plainEnvelope('ERROR', z.strictObject({ code: errorCodeSchema }));
export type ErrorMessage = z.infer<typeof errorMessageSchema>;
