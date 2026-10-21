/**
 * How a frozen player looks (ICE_BOOMERANG), sampled from the reference video (art/physics_reference/README.md, "Ice
 * boomerang"): 6:55.4 the eggplant stands blue (≈ #70c6f6) inside a pale-cyan block (≈ #cffbfc) about 1.75 of its widths across
 * and a little taller than it. How it grows and breaks: render/iceMotion.ts.
 */
export const ICE_LOOK = Object.freeze({
  block: '#cffbfc',
  blockOpacity: 0.7,
  body: '#70c6f6',
  /** The block's size, in body heights (the body is about as wide as tall: 53 × 62 px round a 30 px eggplant). */
  blockWidth: 1.75,
  blockHeight: 2.05,
});
