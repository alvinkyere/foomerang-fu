/**
 * How a frozen player looks (ICE_BOOMERANG), from the HQ videos (2026-10-27: ff physics hq 2.mp4 6:41.8-6:46.9, the sushi;
 * foomerang-fu physics hq.mp4 6:55.83-6:57.62, the eggplant): the body tinted blue (#5a96e0) inside a translucent pale-cyan
 * block with rounded edges, lightest on top (#e5fdfd), its sides #e0fefd going to #b6fafb at the edges. How it grows and breaks: render/iceMotion.ts.
 */
export const ICE_LOOK = Object.freeze({
  block: '#e0fefd',
  blockTop: '#e5fdfd',
  blockEdge: '#b6fafb',
  blockOpacity: 0.62,
  body: '#5a96e0',
  /** The block's size, in character widths: 1.8 across and deep, 1.3 tall (a box that, seen at the camera's 56 degrees, covers
   * the HQ's 90 x 106 px round a ~50 px sushi). */
  blockWidth: 1.8,
  blockHeight: 1.3,
  /** Its depth, as a fraction of its width (a cube seen from above: square). */
  blockDepth: 1,
});
