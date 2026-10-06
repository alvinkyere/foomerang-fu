// Public API of @foomerang/foomerang-fu. The rules live under ./rules and are the only thing the
// platform needs; presentation (Phaser) will live under ./render, the one Phaser zone in this package.

export * from './rules';
export { FU_BUTTONS, FU_CONTROLS } from './controls';
export type { FuButtonId } from './controls';

export { CpuController, DIFFICULTIES, PROFILES, Rng, seedFor } from './cpu';
export type { Difficulty, Profile } from './cpu';
