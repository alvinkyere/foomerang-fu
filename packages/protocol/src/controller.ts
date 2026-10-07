import { z } from 'zod';
import { eventEnvelope, stateEnvelope } from './envelope';

/**
 * Joystick axis: normalized to [-1, 1], finite. Center (0,0); full right (1,0); full left (-1,0).
 * Never pixels, so controllers are independent of screen size. The GAME decides dead zone, speed
 * and acceleration. Only the range is validated here; magnitude (x²+y² ≤ 1) is clamped by the
 * simulation, since legitimate floating-point output can exceed 1 by an epsilon.
 */
export const axisSchema = z.number().min(-1).max(1);

export const movePayloadSchema = z.strictObject({ x: axisSchema, y: axisSchema });

/** Input STATE: latest-wins, loss-tolerant. Stale `seq` is dropped by the receiver. */
export const inputMoveMessageSchema = stateEnvelope('INPUT_MOVE', movePayloadSchema);
export type InputMoveMessage = z.infer<typeof inputMoveMessageSchema>;

/**
 * Generic action ids; each game decides what they mean (throw, dash, accelerate, ...). TERTIARY was
 * added (additively: nothing that sent PRIMARY or SECONDARY changes) for Foomerang Fu's DASH.
 */
export const ACTIONS = ['PRIMARY', 'SECONDARY', 'TERTIARY'] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * Actions that belong to the PLATFORM, not to any game: the phone's own system buttons. MENU is the
 * pause button (open / close the pause menu). A manifest can never name one, so no game can take
 * one over; the host consumes them and never hands them to a game.
 */
export const SYSTEM_ACTIONS = ['MENU'] as const;
export type SystemAction = (typeof SYSTEM_ACTIONS)[number];

/** Anything a controller may send as an INPUT_EVENT: a game action or a system action. */
export type InputAction = Action | SystemAction;
export const INPUT_ACTIONS = [...ACTIONS, ...SYSTEM_ACTIONS] as const;

export const ACTION_PHASES = ['pressed', 'released'] as const;
export type ActionPhase = (typeof ACTION_PHASES)[number];

export const inputEventPayloadSchema = z.strictObject({
  action: z.enum(INPUT_ACTIONS),
  phase: z.enum(ACTION_PHASES),
});

/**
 * Input EVENT: must not be dropped or coalesced. Carries a unique `eventId` so retries/duplicates
 * can be deduplicated by the receiver (a retried press must never throw twice). The schema accepts
 * repeated ids; deduplication is receiver state, not validation.
 */
export const inputEventMessageSchema = eventEnvelope('INPUT_EVENT', inputEventPayloadSchema);
export type InputEventMessage = z.infer<typeof inputEventMessageSchema>;
