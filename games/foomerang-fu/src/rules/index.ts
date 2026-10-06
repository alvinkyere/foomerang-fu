// Foomerang Fu's rules: pure, deterministic, and free of DOM, React, Phaser, Socket.IO, wall-clock
// time and ambient randomness (lint-enforced). The renderer reads this state; it never changes it.

export { PRIMITIVE_ARENA } from './arena';
export { SYSTEMS_ARENA, SYSTEMS_POWERUP_SPOTS } from './systemsArena';
export {
  GARDEN_ARENA,
  GARDEN_BOOK_SPOTS,
  GARDEN_HEIGHT,
  GARDEN_ROCKS,
  GARDEN_SPAWNS,
  GARDEN_WALLS,
  GARDEN_WALL_THICKNESS,
  GARDEN_WIDTH,
  rockRects,
} from './gardenArena';
export type { GardenRock, GardenWall } from './gardenArena';
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

export { DEFAULT_FU_CONFIG, FREE_FOR_ALL } from './config';
export type { FuConfig } from './config';

export { BOOMERANG_TRANSITIONS, DEFLECTION_TRANSITIONS, canTransition } from './boomerang';
export { deflectionDirection } from './deflect';
export type { Boomerang, BoomerangState } from './boomerang';

export type { SlashState } from './slash';
export { isFatigued } from './dash';
export type { DashState, Fatigue } from './dash';

export { MAX_PLAYERS, createFuMatch, rematchOf, roundLabel, spawnPosition } from './state';
export type {
  FuMatchOver,
  FuPhase,
  FuPlayer,
  FuPlayerSpec,
  FuRoundOver,
  FuState,
  RoundLabel,
} from './state';
export { applyDeaths, fullMeters } from './scoring';
export type { Death, DeathCause, ScoreChange, ScoreReason, ScoreResult } from './scoring';

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
