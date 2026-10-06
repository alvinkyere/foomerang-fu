/**
 * Foomerang Fu's controller contract, defined ONCE.
 *
 * The platform's controller is generic: a manifest button has an `id` (the label the player sees)
 * and a generic `action` (PRIMARY / SECONDARY / TERTIARY) that travels on the wire. What an action MEANS is the
 * game's business. Two places must agree on the pairing — the server, which advertises the buttons,
 * and the console, which turns an incoming action into a SLASH or a THROW — and a copy of this
 * table in each is how a THROW button once became a SLASH. Both import it from here instead.
 *
 * Pure data: no protocol, DOM or runtime dependencies.
 */

/** Which generic action each Fu button sends. PRIMARY is the one controllers make biggest. */
export const FU_BUTTONS = Object.freeze({
  SLASH: 'PRIMARY',
  THROW: 'SECONDARY',
  DASH: 'TERTIARY',
} as const);

export type FuButtonId = keyof typeof FU_BUTTONS;

/** The manifest controls Fu asks controllers to render. */
export const FU_CONTROLS = Object.freeze([
  Object.freeze({ id: 'MOVE', type: 'joystick' }),
  Object.freeze({ id: 'SLASH', type: 'button', action: FU_BUTTONS.SLASH }),
  Object.freeze({ id: 'THROW', type: 'button', action: FU_BUTTONS.THROW }),
  Object.freeze({ id: 'DASH', type: 'button', action: FU_BUTTONS.DASH }),
] as const);
