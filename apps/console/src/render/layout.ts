/**
 * Where player decorations sit, as plain numbers the renderer shares with its tests. Pure: no
 * Phaser here, so the layout can be checked without a canvas.
 */

/** How far past the circle's edge the aim triangle's tip reaches. */
export const AIM_TIP_OFFSET = 26;
/** Where the triangle starts, past the circle's edge. */
export const AIM_BASE_OFFSET = 6;
/** Empty space between the aim tip (at its farthest, straight down) and the top of the name. */
const NAME_CLEARANCE = 10;

/** Distance from the player's centre to the top of their name: below even a downward-facing aim tip. */
export const nameOffset = (radius: number): number => radius + AIM_TIP_OFFSET + NAME_CLEARANCE;
