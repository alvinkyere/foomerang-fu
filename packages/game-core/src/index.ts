// Public API of @foomerang/game-core: the deterministic simulation primitives.
// No DOM, Node, React, Phaser or Socket.IO — enforced by lint and by the DOM-free tsconfig.
// test/public-api.test.ts guards this list.

export { createWorld, type WorldParams } from './world';
export type { Arena, Body, EntityId, InputFrame, MovementConfig, WorldState } from './world';

export { step } from './step';

export { DEFAULT_DEAD_ZONE, normalizeMovementInput } from './input';
export type { MovementInput } from './input';

export { FIXED_TIMESTEP_SECONDS, MAX_STEP_SECONDS } from './time';

export { createSeededRandom } from './random';
export type { RandomSource } from './random';

export type { Vec2 } from './vec2';
