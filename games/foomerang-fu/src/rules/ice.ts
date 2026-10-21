/**
 * ICE_BOOMERANG, as the reference video shows it (art/physics_reference/README.md, "Ice boomerang"). An iced boomerang's contact
 * does not kill: it FREEZES (6:54.55, the eggplant encased in an ice block where it stood) for `ICE_FREEZE_SECONDS` (it shattered
 * at 6:56.38), during which the player stands still and can do nothing. A shield they wear pops at the same moment (6:54.52).
 * Not shown, so plain: a frozen player can be killed by any lethal contact; a second ice contact while frozen changes nothing; a
 * blast is a blast (it kills).
 */
export const ICE_FREEZE_SECONDS = 1.83;
