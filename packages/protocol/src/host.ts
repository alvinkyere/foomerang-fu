import { z } from 'zod';
import { ACTIONS, ACTION_PHASES, axisSchema } from './controller';
import { eventIdSchema, plainEnvelope, seqSchema } from './envelope';
import { credentialSchema, joinCodeSchema, wireIdSchema } from './room';

/**
 * Host-facing (console) messages. The host is a separate identity from any player and consumes no
 * seat; it proves ownership of a room with a host credential, never with a socket id.
 */

/** Wire mirrors of the room domain's vocabularies (the server maps domain values onto these). */
export const CONNECTION_STATUSES = ['CONNECTED', 'RECONNECTING', 'DISCONNECTED'] as const;
export const SEAT_STATUSES = ['HELD', 'RELEASED'] as const;
export const ROOM_STATES = [
  'LOBBY',
  'STARTING',
  'PLAYING',
  'RESULTS',
  'CLOSING',
  'CLOSED',
] as const;

/** Client → server (console). `gameId` selects server-side game configuration (capacity, ...). */
export const roomCreateMessageSchema = plainEnvelope(
  'ROOM_CREATE',
  z.strictObject({ gameId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/) }),
);
export type RoomCreateMessage = z.infer<typeof roomCreateMessageSchema>;

/** Client → server (console): reclaim a room after a refresh. The credential rotates on success. */
export const hostReconnectMessageSchema = plainEnvelope(
  'HOST_RECONNECT',
  z.strictObject({ joinCode: joinCodeSchema, hostToken: credentialSchema }),
);
export type HostReconnectMessage = z.infer<typeof hostReconnectMessageSchema>;

/** Server → console. `hostToken` is the host's secret credential. */
export const roomCreatedMessageSchema = plainEnvelope(
  'ROOM_CREATED',
  z.strictObject({ joinCode: joinCodeSchema, hostToken: credentialSchema }),
);
export type RoomCreatedMessage = z.infer<typeof roomCreatedMessageSchema>;

/** Server → console: carries the NEW host credential; the one just used no longer works. */
export const hostReconnectedMessageSchema = plainEnvelope(
  'HOST_RECONNECTED',
  z.strictObject({ joinCode: joinCodeSchema, hostToken: credentialSchema }),
);
export type HostReconnectedMessage = z.infer<typeof hostReconnectedMessageSchema>;

/** One participant in a roster snapshot. Deliberately carries NO credential. */
const rosterEntrySchema = z.strictObject({
  playerId: wireIdSchema,
  displayName: z.string().max(64),
  connection: z.enum(CONNECTION_STATUSES),
  seat: z.enum(SEAT_STATUSES),
});
export type RosterEntry = z.infer<typeof rosterEntrySchema>;

/** Server → console: full roster snapshot, sent when anything about the room's people changes. */
export const roomUpdatedMessageSchema = plainEnvelope(
  'ROOM_UPDATED',
  z.strictObject({
    joinCode: joinCodeSchema,
    state: z.enum(ROOM_STATES),
    hostConnection: z.enum(CONNECTION_STATUSES),
    players: z.array(rosterEntrySchema).max(64),
  }),
);
export type RoomUpdatedMessage = z.infer<typeof roomUpdatedMessageSchema>;

/**
 * Server → console: a player's accepted input, tagged with WHO sent it. The server has already
 * authenticated the sender, discarded stale movement and deduplicated action events.
 */
export const playerInputMessageSchema = plainEnvelope(
  'PLAYER_INPUT',
  z.strictObject({
    playerId: wireIdSchema,
    input: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('MOVE'), seq: seqSchema, x: axisSchema, y: axisSchema }),
      z.strictObject({
        kind: z.literal('ACTION'),
        eventId: eventIdSchema,
        action: z.enum(ACTIONS),
        phase: z.enum(ACTION_PHASES),
      }),
    ]),
  }),
);
export type PlayerInputMessage = z.infer<typeof playerInputMessageSchema>;
