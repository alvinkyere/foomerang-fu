/**
 * ICE_BOOMERANG, as the reference video shows it (art/physics_reference/README.md, "Ice boomerang"). An iced boomerang's contact
 * does not kill: it FREEZES (6:54.55, the eggplant encased in an ice block where it stood) for `ICE_FREEZE_SECONDS` (it shattered
 * at 6:56.38), during which the player stands still and can do nothing. A shield they wear pops at the same moment (6:54.52).
 * Not shown, so plain: a frozen player can be killed by any lethal contact; a second ice contact while frozen changes nothing; a
 * blast is a blast (it kills).
 */
export const ICE_FREEZE_SECONDS = 1.83;

/**
 * A slash on a frozen player does not kill (owner, 2026-10-26, from ff physics hq 2.mp4 6:43.62: the ice cream slashes beside the
 * frozen sushi, whose block shoots off ~3 character widths in ~0.5 s and stays frozen): it knocks the block sliding away from
 * the slasher at `ICE_SLIDE_SPEED`, slowing at `ICE_SLIDE_DECELERATION` to a stop. The freeze runs on as it was. Units/s, /s².
 */
export const ICE_SLIDE_SPEED = 820;
export const ICE_SLIDE_DECELERATION = 1800;
