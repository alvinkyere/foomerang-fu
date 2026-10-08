import { z } from 'zod';
import { handshakeAcceptedMessageSchema, handshakeMessageSchema } from './client';
import {
  CONTROLLER_CONTEXTS,
  controllerContextSetMessageSchema,
  secondaryActionSchema,
} from './context';
import {
  ACTION_PHASES,
  INPUT_ACTIONS,
  axisSchema,
  inputEventMessageSchema,
  inputMoveMessageSchema,
} from './controller';
import { eventIdSchema, plainEnvelope, seqSchema, stateEnvelope } from './envelope';
import { errorMessageSchema } from './errors';
import { heartbeatAckMessageSchema, heartbeatMessageSchema } from './heartbeat';
import {
  CONNECTION_STATUSES,
  SEAT_STATUSES,
  hostReconnectMessageSchema,
  hostReconnectedMessageSchema,
} from './host';
import { controllerManifestMessageSchema, type ControlDescriptor } from './manifest';
import { credentialSchema, joinCodeSchema } from './room';

/**
 * The console-session wire vocabulary (ADR-004, Checkpoint C). A phone joins FOOMERANG — a console
 * session — and becomes a CONTROLLER; the TV (host) launches games and seats controllers as the
 * PARTICIPANTS of one game launch (a game session).
 *
 *   CONSOLE_*     the console session's lifecycle
 *   CONTROLLER_*  a controller's membership of it
 *   GAME_*        the active game launch
 *
 * Additive under protocol version 1. These messages are NOT yet accepted at the legacy trust
 * boundary (`parseClientMessage` / `parseServerMessage`); they have their own unions and parsers
 * here, and the server adopts them in C3. Messages that both flows share (handshake, heartbeat,
 * HOST_RECONNECT, input, the host's CONTROLLER_CONTEXT, ERROR, CONTROLLER_MANIFEST) are reused by
 * reference, never copied.
 *
 * Identity on the wire, as everywhere: a join code to find a console, a credential to prove who you
 * are. The console session's own id never travels (nobody outside the server needs it).
 */

// --- identities ------------------------------------------------------------------------------

/** Server-issued ids are UUIDs today; the wire accepts any short, URL-safe opaque id. */
const opaqueId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

/**
 * A phone's membership of a console session. Survives game launches and Home. Branded so it can
 * never be passed where a game session id (or a legacy player id) is expected.
 */
export const controllerIdSchema = opaqueId.brand<'ControllerId'>();
export type ControllerId = z.infer<typeof controllerIdSchema>;

/** One launch of one game. Every game-scoped message names it; one for an ended launch is stale. */
export const gameSessionIdSchema = opaqueId.brand<'GameSessionId'>();
export type GameSessionId = z.infer<typeof gameSessionIdSchema>;

/**
 * A participant is identified by (gameSessionId, controllerId): it exists only inside one game
 * launch. CPUs are participants too, but only on the TV; they never travel.
 */
export interface ParticipantRef {
  readonly gameSessionId: GameSessionId;
  readonly controllerId: ControllerId;
}

// --- vocabularies ----------------------------------------------------------------------------

export const CONSOLE_STATES = ['OPEN', 'CLOSING', 'CLOSED'] as const;
export type ConsoleState = (typeof CONSOLE_STATES)[number];

/** One game launch's lifecycle (the room cycle, without CLOSING: closing belongs to the console). */
export const GAME_STATES = ['LOBBY', 'STARTING', 'PLAYING', 'RESULTS'] as const;
export type GameState = (typeof GAME_STATES)[number];

/** Membership of the console (the legacy wire calls the same two facts a seat). */
export const MEMBERSHIP_STATUSES = SEAT_STATUSES;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/**
 * What ONE controller's controls mean now: the four semantic contexts, plus WAITING — a game is
 * being played and this controller is not in it (no game actions, no pause). Never a screen name.
 * WAITING is derived by the server per controller; the TV can never set it.
 */
export const EFFECTIVE_CONTEXTS = [...CONTROLLER_CONTEXTS, 'WAITING'] as const;
export type EffectiveContext = (typeof EFFECTIVE_CONTEXTS)[number];

export const PARTICIPATION_STATUSES = ['PARTICIPANT', 'WAITING'] as const;
export type ParticipationStatus = (typeof PARTICIPATION_STATUSES)[number];

/** Why a controller's membership ended, so the phone can say so in plain words. */
export const CONSOLE_END_REASONS = ['CLOSED_BY_TV', 'TV_GONE', 'REMOVED'] as const;
export type ConsoleEndReason = (typeof CONSOLE_END_REASONS)[number];

/** Wire bound on a console's controllers / a game's human participants (domain limits are lower: 8 / 6). */
export const MAX_WIRE_CONTROLLERS = 16;

/**
 * The phone's base console controller: what every phone physically offers before any game exists
 * (Home). A platform constant, never transmitted. A game's CONTROLLER_MANIFEST uses the same generic
 * actions, so launching a game relabels controls rather than moving them.
 */
export const CONSOLE_CONTROLLER: {
  readonly orientation: 'any';
  readonly controls: readonly ControlDescriptor[];
} = Object.freeze({
  orientation: 'any',
  controls: Object.freeze([
    { id: 'NAVIGATE', type: 'joystick' },
    { id: 'SELECT', type: 'button', action: 'PRIMARY' },
    { id: 'BACK', type: 'button', action: 'SECONDARY' },
    { id: 'OPTION', type: 'button', action: 'TERTIARY' },
  ] as const),
});

const gameIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const displayNameWireSchema = z.string().max(64);

/** A human participant as the TV seated it: which controller, and the seat number the TV gave it. */
const participantSchema = z.strictObject({
  controllerId: controllerIdSchema,
  /** The TV's own seat label (1-based). CPUs fill seats too, so only the TV can number them. */
  seat: z.number().int().min(1).max(MAX_WIRE_CONTROLLERS),
});
export type ParticipantEntry = z.infer<typeof participantSchema>;

const participantsSchema = z
  .array(participantSchema)
  .max(MAX_WIRE_CONTROLLERS)
  .refine((list) => new Set(list.map((p) => p.controllerId)).size === list.length, {
    message: 'a controller is seated at most once',
  })
  .refine((list) => new Set(list.map((p) => p.seat)).size === list.length, {
    message: 'a seat holds at most one participant',
  });

// --- TV (host) → server ----------------------------------------------------------------------

/** Foomerang started on a TV: open a console session. A console connection with no identity only. */
export const consoleOpenMessageSchema = plainEnvelope('CONSOLE_OPEN', z.strictObject({}));
export type ConsoleOpenMessage = z.infer<typeof consoleOpenMessageSchema>;

/** The TV closes Foomerang's session (confirmed on the TV). Host only. */
export const consoleCloseMessageSchema = plainEnvelope('CONSOLE_CLOSE', z.strictObject({}));
export type ConsoleCloseMessage = z.infer<typeof consoleCloseMessageSchema>;

/** The TV removes a controller (confirmed on the TV): its membership ends for good. Host only. */
export const controllerRemoveMessageSchema = plainEnvelope(
  'CONTROLLER_REMOVE',
  z.strictObject({ controllerId: controllerIdSchema }),
);
export type ControllerRemoveMessage = z.infer<typeof controllerRemoveMessageSchema>;

/** Launch a game on the console (only when none is active). Host only. The reply is CONSOLE_UPDATED. */
export const gameLaunchMessageSchema = plainEnvelope(
  'GAME_LAUNCH',
  z.strictObject({ gameId: gameIdSchema }),
);
export type GameLaunchMessage = z.infer<typeof gameLaunchMessageSchema>;

/**
 * Who plays in this launch, as the TV decides (it alone knows the CPUs filling other seats). A
 * STATE message: `seq` per host connection, latest wins. Only the TV seats or benches; joining never
 * does. Refused while a match is running or paused; ignored for an ended launch.
 */
export const gameParticipantsMessageSchema = stateEnvelope(
  'GAME_PARTICIPANTS',
  z.strictObject({ gameSessionId: gameSessionIdSchema, participants: participantsSchema }),
);
export type GameParticipantsMessage = z.infer<typeof gameParticipantsMessageSchema>;

/** Begin a match in THIS launch (game-scoped: a start aimed at an ended launch is stale). Host only. */
export const gameMatchStartMessageSchema = plainEnvelope(
  'MATCH_START',
  z.strictObject({ gameSessionId: gameSessionIdSchema }),
);
export type GameMatchStartMessage = z.infer<typeof gameMatchStartMessageSchema>;

/** End the match in THIS launch. Host only. */
export const gameMatchEndMessageSchema = plainEnvelope(
  'MATCH_END',
  z.strictObject({ gameSessionId: gameSessionIdSchema }),
);
export type GameMatchEndMessage = z.infer<typeof gameMatchEndMessageSchema>;

/** Back to Home: the launch and its seats end; every controller stays. Host only. */
export const gameExitMessageSchema = plainEnvelope(
  'GAME_EXIT',
  z.strictObject({ gameSessionId: gameSessionIdSchema }),
);
export type GameExitMessage = z.infer<typeof gameExitMessageSchema>;

// --- phone → server --------------------------------------------------------------------------

/** Join Foomerang (not a game): a controller connection with no identity only. */
export const controllerJoinMessageSchema = plainEnvelope(
  'CONTROLLER_JOIN',
  z.strictObject({ joinCode: joinCodeSchema, displayName: displayNameWireSchema }),
);
export type ControllerJoinMessage = z.infer<typeof controllerJoinMessageSchema>;

/** Same controller, new connection. The credential rotates on success. */
export const controllerReconnectMessageSchema = plainEnvelope(
  'CONTROLLER_RECONNECT',
  z.strictObject({ joinCode: joinCodeSchema, reconnectToken: credentialSchema }),
);
export type ControllerReconnectMessage = z.infer<typeof controllerReconnectMessageSchema>;

/** The phone leaves Foomerang now (no reservation wait). Controller identity only. */
export const controllerLeaveMessageSchema = plainEnvelope('CONTROLLER_LEAVE', z.strictObject({}));
export type ControllerLeaveMessage = z.infer<typeof controllerLeaveMessageSchema>;

// --- server → TV -----------------------------------------------------------------------------

/** Reply to CONSOLE_OPEN. `hostToken` is the TV's secret credential, sent only to it. */
export const consoleOpenedMessageSchema = plainEnvelope(
  'CONSOLE_OPENED',
  z.strictObject({ joinCode: joinCodeSchema, hostToken: credentialSchema }),
);
export type ConsoleOpenedMessage = z.infer<typeof consoleOpenedMessageSchema>;

/** One controller in a console snapshot. Deliberately NO credential (the schema is strict). */
const controllerEntrySchema = z.strictObject({
  controllerId: controllerIdSchema,
  displayName: displayNameWireSchema,
  connection: z.enum(CONNECTION_STATUSES),
  membership: z.enum(MEMBERSHIP_STATUSES),
});
export type ControllerEntry = z.infer<typeof controllerEntrySchema>;

const activeGameSchema = z.strictObject({
  gameSessionId: gameSessionIdSchema,
  gameId: gameIdSchema,
  state: z.enum(GAME_STATES),
  participants: participantsSchema,
});
export type ActiveGame = z.infer<typeof activeGameSchema>;

/**
 * Full snapshot of the console for the TV, sent whenever anything in it changes (and after the TV
 * reclaims it). Participants are always controllers that hold membership.
 */
export const consoleUpdatedMessageSchema = plainEnvelope(
  'CONSOLE_UPDATED',
  z
    .strictObject({
      joinCode: joinCodeSchema,
      state: z.enum(CONSOLE_STATES),
      hostConnection: z.enum(CONNECTION_STATUSES),
      controllers: z.array(controllerEntrySchema).max(MAX_WIRE_CONTROLLERS * 4),
      game: activeGameSchema.nullable(),
    })
    .refine(
      (s) => new Set(s.controllers.map((c) => c.controllerId)).size === s.controllers.length,
      { message: 'controller ids are unique' },
    )
    .refine(
      (s) => {
        const held = new Set(
          s.controllers.filter((c) => c.membership === 'HELD').map((c) => c.controllerId),
        );
        return (s.game?.participants ?? []).every((p) => held.has(p.controllerId));
      },
      { message: 'every participant is a controller that holds membership' },
    ),
);
export type ConsoleUpdatedMessage = z.infer<typeof consoleUpdatedMessageSchema>;

/**
 * A controller's accepted input, tagged with WHICH controller sent it (the console-flow successor of
 * PLAYER_INPUT, whose `playerId` would blur a controller with a player). The server has
 * authenticated the sender, dropped stale movement, deduplicated events, and only routes the system
 * MENU from an active participant.
 */
export const controllerInputMessageSchema = plainEnvelope(
  'CONTROLLER_INPUT',
  z.strictObject({
    controllerId: controllerIdSchema,
    input: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('MOVE'), seq: seqSchema, x: axisSchema, y: axisSchema }),
      z.strictObject({
        kind: z.literal('ACTION'),
        eventId: eventIdSchema,
        action: z.enum(INPUT_ACTIONS),
        phase: z.enum(ACTION_PHASES),
      }),
    ]),
  }),
);
export type ControllerInputMessage = z.infer<typeof controllerInputMessageSchema>;

// --- server → phone --------------------------------------------------------------------------

/** Reply to CONTROLLER_JOIN. `reconnectToken` is the phone's secret, sent only to it. */
export const controllerJoinedMessageSchema = plainEnvelope(
  'CONTROLLER_JOINED',
  z.strictObject({ controllerId: controllerIdSchema, reconnectToken: credentialSchema }),
);
export type ControllerJoinedMessage = z.infer<typeof controllerJoinedMessageSchema>;

/** Reply to CONTROLLER_RECONNECT: the SAME controller and the NEW credential. */
export const controllerReconnectedMessageSchema = plainEnvelope(
  'CONTROLLER_RECONNECTED',
  z.strictObject({ controllerId: controllerIdSchema, reconnectToken: credentialSchema }),
);
export type ControllerReconnectedMessage = z.infer<typeof controllerReconnectedMessageSchema>;

/**
 * What THIS phone's controls mean now, in one atomic view: the semantic context (including
 * WAITING), the secondary action, and its participation in the active launch (`null`: no game, or
 * not in it and nothing is being played). `version` is the console's controller-view version: it
 * rises whenever any controller's view may have changed, so a phone discards anything older.
 *
 * Consistency is enforced on the wire: WAITING (context) ⇔ a WAITING participation during a match;
 * a participant is never WAITING.
 */
export const controllerViewMessageSchema = plainEnvelope(
  'CONTROLLER_CONTEXT',
  z
    .strictObject({
      context: z.enum(EFFECTIVE_CONTEXTS),
      secondaryAction: secondaryActionSchema,
      version: seqSchema.min(1),
      participation: z
        .strictObject({
          gameSessionId: gameSessionIdSchema,
          status: z.enum(PARTICIPATION_STATUSES),
          /** The seat the TV gave this participant; absent while WAITING. */
          seat: z.number().int().min(1).max(MAX_WIRE_CONTROLLERS).optional(),
        })
        .nullable(),
    })
    .refine((v) => v.context !== 'WAITING' || v.participation?.status === 'WAITING', {
      message: 'WAITING is only for a controller that is waiting in the active launch',
    })
    .refine(
      (v) => v.participation?.status !== 'PARTICIPANT' || v.participation.seat !== undefined,
      {
        message: 'a participant has a seat',
      },
    )
    .refine((v) => v.participation?.status !== 'WAITING' || v.participation.seat === undefined, {
      message: 'a waiting controller has no seat',
    }),
);
export type ControllerViewMessage = z.infer<typeof controllerViewMessageSchema>;

/** The TV's connection, so a phone can say "TV reconnecting…" instead of going silent. */
export const consoleStatusMessageSchema = plainEnvelope(
  'CONSOLE_STATUS',
  z.strictObject({ hostConnection: z.enum(CONNECTION_STATUSES) }),
);
export type ConsoleStatusMessage = z.infer<typeof consoleStatusMessageSchema>;

/** This phone's membership is over (closed by the TV, TV gone, or removed). Terminal. */
export const consoleEndedMessageSchema = plainEnvelope(
  'CONSOLE_ENDED',
  z.strictObject({ reason: z.enum(CONSOLE_END_REASONS) }),
);
export type ConsoleEndedMessage = z.infer<typeof consoleEndedMessageSchema>;

// --- the console flow's unions ---------------------------------------------------------------

/** Everything a client may send in the console flow. No ROOM_* message belongs here. */
export const consoleClientMessageSchema = z.discriminatedUnion('type', [
  handshakeMessageSchema,
  heartbeatMessageSchema,
  inputMoveMessageSchema,
  inputEventMessageSchema,
  // TV
  consoleOpenMessageSchema,
  hostReconnectMessageSchema,
  consoleCloseMessageSchema,
  controllerRemoveMessageSchema,
  gameLaunchMessageSchema,
  gameParticipantsMessageSchema,
  gameMatchStartMessageSchema,
  gameMatchEndMessageSchema,
  gameExitMessageSchema,
  controllerContextSetMessageSchema,
  // phone
  controllerJoinMessageSchema,
  controllerReconnectMessageSchema,
  controllerLeaveMessageSchema,
]);
export type ConsoleClientMessage = z.infer<typeof consoleClientMessageSchema>;

/** Everything the server may send in the console flow. */
export const consoleServerMessageSchema = z.discriminatedUnion('type', [
  errorMessageSchema,
  heartbeatAckMessageSchema,
  handshakeAcceptedMessageSchema,
  // TV
  consoleOpenedMessageSchema,
  hostReconnectedMessageSchema,
  consoleUpdatedMessageSchema,
  controllerInputMessageSchema,
  // phone
  controllerJoinedMessageSchema,
  controllerReconnectedMessageSchema,
  controllerManifestMessageSchema,
  controllerViewMessageSchema,
  consoleStatusMessageSchema,
  consoleEndedMessageSchema,
]);
export type ConsoleServerMessage = z.infer<typeof consoleServerMessageSchema>;
