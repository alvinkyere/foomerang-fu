import { z } from 'zod';
import { plainEnvelope } from './envelope';

/**
 * Human-friendly join code: six characters, no 0 O 1 I L. 31^6 ≈ 887M combinations.
 *
 * The protocol owns only the *representation*. Generating an available code (and handling
 * collisions against active rooms) is room-engine behavior.
 */
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 6;

export type JoinCode = string;

// Deliberately validated BEFORE any case folding, and against ASCII only: calling
// toUpperCase() on arbitrary Unicode would let 'ſ' (→ 'S') or 'ß' (→ 'SS') slip through.
const JOIN_CODE_PATTERN = new RegExp(
  `^[${JOIN_CODE_ALPHABET}${JOIN_CODE_ALPHABET.toLowerCase()}]{${JOIN_CODE_LENGTH}}$`,
);

/** Accepts any ASCII case; yields the canonical uppercase form. */
export const joinCodeSchema = z
  .string()
  .regex(JOIN_CODE_PATTERN)
  .transform((code): JoinCode => code.toUpperCase());

// ---------------------------------------------------------------------------------------------
// Controller-facing room messages. Identity on the wire is: join code (discovery) + credential
// (proof). Never a socket id, IP address or display name.
// ---------------------------------------------------------------------------------------------

/** Opaque server-issued credential (reconnect / host token). Bounded; the format is the server's business. */
export const credentialSchema = z.string().min(1).max(128);

/** Opaque server-issued identifier (e.g. a PlayerId). Bounded. */
export const wireIdSchema = z.string().min(1).max(64);

/**
 * Only bounded here, so a multi-megabyte name never reaches the domain. The real rules (trimming,
 * 1–16 characters, no control/format characters) belong to the room domain, which answers
 * INVALID_DISPLAY_NAME — a better error than a generic INVALID_MESSAGE.
 */
const displayNameWireSchema = z.string().max(64);

/** Client → server. */
export const roomJoinMessageSchema = plainEnvelope(
  'ROOM_JOIN',
  z.strictObject({ joinCode: joinCodeSchema, displayName: displayNameWireSchema }),
);
export type RoomJoinMessage = z.infer<typeof roomJoinMessageSchema>;

/** Client → server: same player, new connection. The credential rotates on success. */
export const playerReconnectMessageSchema = plainEnvelope(
  'PLAYER_RECONNECT',
  z.strictObject({ joinCode: joinCodeSchema, reconnectToken: credentialSchema }),
);
export type PlayerReconnectMessage = z.infer<typeof playerReconnectMessageSchema>;

/** Server → client. `reconnectToken` is the player's (secret) credential; it is never broadcast. */
export const roomJoinedMessageSchema = plainEnvelope(
  'ROOM_JOINED',
  z.strictObject({ playerId: wireIdSchema, reconnectToken: credentialSchema }),
);
export type RoomJoinedMessage = z.infer<typeof roomJoinedMessageSchema>;

/** Server → client: carries the NEW credential; the one just used no longer works. */
export const playerReconnectedMessageSchema = plainEnvelope(
  'PLAYER_RECONNECTED',
  z.strictObject({ playerId: wireIdSchema, reconnectToken: credentialSchema }),
);
export type PlayerReconnectedMessage = z.infer<typeof playerReconnectedMessageSchema>;
