import { z } from 'zod';
import { plainEnvelope, seqSchema, stateEnvelope } from './envelope';

/**
 * CONTROLLER_CONTEXT: what a controller's physical controls MEAN right now. It is not a screen name
 * and not a remote UI: the controller must never learn (or care) whether the host is showing a home
 * screen, a settings page, a pause menu or a champion; only whether its controls are driving the
 * GAME, or the console around it.
 *
 *   GAMEPLAY  joystick MOVE · button SLASH · THROW · DASH, exactly as the game defines them
 *   CONSOLE   joystick NAVIGATE · SLASH = select · THROW = back · DASH = secondary (if any)
 *   PAUSED    same menu meaning, while the game is frozen
 *   RESULTS   same menu meaning, after a match
 *
 * The manifest says what the controller PHYSICALLY has (and is sent once); the context says what
 * those controls mean (and changes). Never use manifest updates to relabel buttons.
 */
export const CONTROLLER_CONTEXTS = ['GAMEPLAY', 'CONSOLE', 'PAUSED', 'RESULTS'] as const;
export type ControllerContext = (typeof CONTROLLER_CONTEXTS)[number];

/** A short, fixed vocabulary for the one secondary button: deliberately not free text. */
export const SECONDARY_ACTION_LABELS = ['OPTIONS', 'DETAILS', 'REMOVE'] as const;
export type SecondaryActionLabel = (typeof SECONDARY_ACTION_LABELS)[number];

/** `null`: the secondary button does nothing here, so the controller must not label it. */
const secondaryActionSchema = z.strictObject({ label: z.enum(SECONDARY_ACTION_LABELS) }).nullable();
export type SecondaryAction = z.infer<typeof secondaryActionSchema>;

const contextPayloadShape = {
  context: z.enum(CONTROLLER_CONTEXTS),
  secondaryAction: secondaryActionSchema,
};

/**
 * Host → server. A state message: `seq` is per host connection and a stale one is dropped. Only the
 * room's host may send it; controllers cannot set (or request) their own context.
 */
export const controllerContextSetMessageSchema = stateEnvelope(
  'CONTROLLER_CONTEXT',
  z.strictObject(contextPayloadShape),
);
export type ControllerContextSetMessage = z.infer<typeof controllerContextSetMessageSchema>;

/**
 * Server → controller. `version` is the ROOM's authoritative, monotonically increasing context
 * version (it survives host reconnects), so a controller can discard a stale message.
 */
export const controllerContextMessageSchema = plainEnvelope(
  'CONTROLLER_CONTEXT',
  z.strictObject({ ...contextPayloadShape, version: seqSchema.min(1) }),
);
export type ControllerContextMessage = z.infer<typeof controllerContextMessageSchema>;
