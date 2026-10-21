/**
 * FIRE_BOOMERANG, as the reference video shows it (art/physics_reference/README.md, "Fire boomerang"). A fire boomerang's
 * contact does not kill at once: it sets the victim BURNING (9:55.8, the eggplant catches fire); they keep moving, burning, and
 * the burn kills them `FIRE_BURN_SECONDS` later (charred by 9:57.9), credited to the thrower. A burning player and a flying fire
 * boomerang leave fire on the ground (drawn; the video does not show it setting anyone else alight, so it is not a rule).
 * Not shown, so plain: a shield takes a fire hit like any lethal contact; a second fire hit while burning changes nothing.
 */
export const FIRE_BURN_SECONDS = 2.1;
