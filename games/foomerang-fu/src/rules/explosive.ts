/**
 * EXPLOSIVE_BOOMERANG's fuse, as the reference video shows it (foomerang-fu physics hq.mp4, 60 fps; art/physics_reference/
 * README.md, "The Explosive's tick"): where an armed boomerang's flight out ends it does not go off at once. It lands there and
 * lies ticking (flashing faster and faster) for EXPLOSIVE_FUSE seconds, then goes off where it lies (5:21.95 landed, 5:22.47 the
 * blast; it crept under 0.2 character widths meanwhile: it lies still). While it ticks its thrower can neither pick it up nor
 * pull it home. Touching an enemy in flight still sets it off at once (owner, 2026-10-19).
 */
export const EXPLOSIVE_FUSE = 0.5;
