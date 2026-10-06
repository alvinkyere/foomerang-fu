// Foomerang Fu's rules: pure, deterministic, and free of DOM, React, Phaser, Socket.IO, wall-clock
// time and ambient randomness (lint-enforced). The renderer reads this state; it never changes it.

export { PRIMITIVE_ARENA } from './arena';
export { SYSTEMS_ARENA, SYSTEMS_POWERUP_SPOTS } from './systemsArena';
export { gatePhaseAt, hazardPhaseAt, platformAt, systemsView } from './systems';
export type {
  GatePhase,
  GateSpec,
  HazardPhase,
  HazardSpec,
  PlatformSpec,
  SystemsView,
} from './systems';
export type { FuArena, Rect } from './arena';

export { DEFAULT_FU_CONFIG } from './config';
export type { FuConfig } from './config';

export { BOOMERANG_TRANSITIONS, DEFLECTION_TRANSITIONS, canTransition } from './boomerang';
export { deflectionDirection } from './deflect';
export type { Boomerang, BoomerangState } from './boomerang';

export type { SlashState } from './slash';
export { isFatigued } from './dash';
export type { DashState, Fatigue } from './dash';

export { MAX_PLAYERS, createFuMatch, spawnPosition } from './state';
export type { FuPhase, FuPlayer, FuPlayerSpec, FuRoundOver, FuState } from './state';

export { stepFu } from './step';
export type { FuEvent, FuInputs, FuPlayerInput, FuStepResult } from './step';

export {
  POWER_COMBINATIONS,
  POWER_KINDS,
  NO_POWERS,
  MAX_POWERS,
  SPAWN_RATES,
  awardPower,
  awardPool,
  chooseAward,
  owns,
  removePower,
  isPowerKind,
} from './powerups';
export type {
  Inventory,
  Pickup,
  PickupClock,
  PowerKind,
  PowerupConfig,
  SpawnRate,
} from './powerups';
export { PRIMITIVE_POWERUPS, powerupsFor } from './config';
