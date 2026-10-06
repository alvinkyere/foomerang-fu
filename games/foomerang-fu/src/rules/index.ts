// Foomerang Fu's rules: pure, deterministic, and free of DOM, React, Phaser, Socket.IO, wall-clock
// time and ambient randomness (lint-enforced). The renderer reads this state; it never changes it.

export { PRIMITIVE_ARENA } from './arena';
export type { FuArena, Rect } from './arena';

export { DEFAULT_FU_CONFIG } from './config';
export type { FuConfig } from './config';

export { BOOMERANG_TRANSITIONS, DEFLECTION_TRANSITIONS, canTransition } from './boomerang';
export { deflectionDirection } from './deflect';
export type { Boomerang, BoomerangState } from './boomerang';

export type { SlashState } from './slash';

export { MAX_PLAYERS, createFuMatch, spawnPosition } from './state';
export type { FuPhase, FuPlayer, FuPlayerSpec, FuRoundOver, FuState } from './state';

export { stepFu } from './step';
export type { FuEvent, FuInputs, FuPlayerInput, FuStepResult } from './step';
