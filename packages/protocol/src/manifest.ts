import { z } from 'zod';
import { plainEnvelope } from './envelope';

/**
 * The controller manifest: a game-provided description of what the controller should render.
 * The controller app renders FROM this; it contains no per-game branches (never
 * `if (gameId === "foomerang-fu")`). Foomerang Fu may later advertise MOVE, THROW and DASH; a
 * racing game something entirely different, with no change to the controller architecture.
 *
 * V1 deliberately knows only the control types the controller actually implements. Adding a
 * type (e.g. 'button') is an additive protocol change made together with its implementation.
 */
export const CONTROL_TYPES = ['joystick'] as const;
export type ControlType = (typeof CONTROL_TYPES)[number];

/** The game's preference. A controller must still work in the other orientation. */
export const CONTROLLER_ORIENTATIONS = ['landscape', 'portrait', 'any'] as const;
export type ControllerOrientation = (typeof CONTROLLER_ORIENTATIONS)[number];

const controlSchema = z.strictObject({
  /** The game's name for the control, e.g. MOVE. The platform attaches no meaning beyond routing. */
  id: z.string().regex(/^[A-Z][A-Z0-9_]{0,31}$/),
  type: z.enum(CONTROL_TYPES),
});
export type ControlDescriptor = z.infer<typeof controlSchema>;

export const controllerManifestSchema = z
  .strictObject({
    gameId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    orientation: z.enum(CONTROLLER_ORIENTATIONS),
    controls: z.array(controlSchema).min(1).max(16),
  })
  .refine(
    (manifest) => new Set(manifest.controls.map((c) => c.id)).size === manifest.controls.length,
    {
      message: 'control ids must be unique',
    },
  );
export type ControllerManifest = z.infer<typeof controllerManifestSchema>;

/** Server → client, after a player joins or reconnects. */
export const controllerManifestMessageSchema = plainEnvelope(
  'CONTROLLER_MANIFEST',
  controllerManifestSchema,
);
export type ControllerManifestMessage = z.infer<typeof controllerManifestMessageSchema>;
