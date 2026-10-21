/**
 * How a frozen player looks (ICE_BOOMERANG), sampled from the reference video (art/physics_reference/README.md, "Ice
 * boomerang"): 6:55.4 the eggplant stands blue (≈ #70c6f6) inside a pale-cyan block (≈ #cffbfc) about 1.75 of its widths across
 * and a little taller than it; 6:56.38 the block shatters into pale shards that lie about its feet (still there at 6:56.75).
 */
export const ICE_LOOK = Object.freeze({
  block: '#cffbfc',
  blockOpacity: 0.7,
  body: '#70c6f6',
  /** The block's size, in body heights (the body is about as wide as tall: 53 × 62 px round a 30 px eggplant). */
  blockWidth: 1.75,
  blockHeight: 2.05,
  shards: 10,
  /** How long the shards are seen, ms (6:56.38 to at least 6:56.75). */
  shardMs: 600,
});
