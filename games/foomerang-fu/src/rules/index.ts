// Foomerang Fu's rules: pure, deterministic, and free of DOM, React, Phaser, Socket.IO, wall-clock
// time and ambient randomness (lint-enforced). The renderer reads this state; it never changes it.

export { PRIMITIVE_ARENA, boundsOf, distanceToSolid } from './arena';
export { SYSTEMS_ARENA, SYSTEMS_POWERUP_SPOTS } from './systemsArena';
export {
  MARKET_PLAZA_ARENA,
  MARKET_PLAZA_BOOK_SPOTS,
  MARKET_PLAZA_HEIGHT,
  MARKET_PLAZA_SPAWNS,
  MARKET_PLAZA_BREAKABLES,
  MARKET_PLAZA_WALLS,
  MARKET_PLAZA_WIDTH,
} from './marketPlazaArena';
export type { MarketPlazaBreakable, MarketPlazaWall } from './marketPlazaArena';
export {
  HARBOUR_FORT_ARENA,
  HARBOUR_FORT_BOOK_SPOTS,
  HARBOUR_FORT_HEIGHT,
  HARBOUR_FORT_SPAWNS,
  HARBOUR_FORT_WALLS,
  HARBOUR_FORT_WIDTH,
} from './harbourFortArena';
export type { HarbourFortWall } from './harbourFortArena';
export {
  SKY_ISLANDS_ARENA,
  SKY_ISLANDS_BOOK_SPOTS,
  SKY_ISLANDS_HEIGHT,
  SKY_ISLANDS_SPAWNS,
  SKY_ISLANDS_WALLS,
  SKY_ISLANDS_WIDTH,
} from './skyIslandsArena';
export {
  GONG_ISLANDS_ARENA,
  GONG_ISLANDS_BOOK_SPOTS,
  GONG_ISLANDS_BREAKABLES,
  GONG_ISLANDS_GROUND,
  GONG_ISLANDS_HEIGHT,
  GONG_ISLANDS_SPAWNS,
  GONG_ISLANDS_WALLS,
  GONG_ISLANDS_WIDTH,
} from './gongIslandsArena';
export type { GongIslandsBreakable, GongIslandsWall } from './gongIslandsArena';
export type { SkyIslandsWall } from './skyIslandsArena';
export { gatePhaseAt, hazardPhaseAt, platformAt, systemsView } from './systems';
export type {
  GatePhase,
  GateSpec,
  HazardPhase,
  HazardSpec,
  PlatformSpec,
  SystemsView,
} from './systems';
export type { Breakable, Disc, FuArena, Rect, Solid, TurnedBox } from './arena';

export { DEFAULT_FU_CONFIG, FREE_FOR_ALL } from './config';
export type { FuConfig } from './config';

export { BOOMERANG_TRANSITIONS, DEFLECTION_TRANSITIONS, canTransition } from './boomerang';
export { deflectionDirection } from './deflect';
export type { Boomerang, BoomerangState } from './boomerang';

export type { SlashState } from './slash';
export { isFatigued } from './dash';
export type { DashState, Fatigue } from './dash';

export { MAX_PLAYERS, createFuMatch, rematchOf, roundLabel, spawnPosition } from './state';
export { spawnsForRound } from './spawnPlan';
export type {
  FuMatchOver,
  FuPhase,
  FuPlayer,
  FuPlayerSpec,
  FuRoundOver,
  FuState,
  RoundLabel,
  ThrowCharge,
} from './state';
export { applyDeaths, fullMeters } from './scoring';
export type { Death, DeathCause, ScoreChange, ScoreReason, ScoreResult } from './scoring';

export { continueRound, stepFu } from './step';
export type { FuEvent, FuInputs, FuPlayerInput, FuStepResult } from './step';

export {
  POWER_COMBINATIONS,
  POWER_KINDS,
  KEPT_POWER_KINDS,
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
export {
  POND_GARDEN_ARENA,
  POND_GARDEN_BOOK_SPOTS,
  POND_GARDEN_HEIGHT,
  POND_GARDEN_SPAWNS,
  POND_GARDEN_WALLS,
  POND_GARDEN_WIDTH,
} from './pondGardenArena';
export type { PondGardenWall } from './pondGardenArena';
export {
  LAKESHORE_ARENA,
  LAKESHORE_BOOK_SPOTS,
  LAKESHORE_HEIGHT,
  LAKESHORE_SPAWNS,
  LAKESHORE_WALLS,
  LAKESHORE_WIDTH,
} from './lakeshoreArena';
export type { LakeshoreWall } from './lakeshoreArena';
export {
  FARM_PLOTS_ARENA,
  FARM_PLOTS_BOOK_SPOTS,
  FARM_PLOTS_HEIGHT,
  FARM_PLOTS_SPAWNS,
  FARM_PLOTS_WALLS,
  FARM_PLOTS_WIDTH,
} from './farmPlotsArena';
export type { FarmPlotsWall } from './farmPlotsArena';
export {
  FLOODED_RUINS_ARENA,
  FLOODED_RUINS_BOOK_SPOTS,
  FLOODED_RUINS_HEIGHT,
  FLOODED_RUINS_SPAWNS,
  FLOODED_RUINS_WALLS,
  FLOODED_RUINS_WIDTH,
} from './floodedRuinsArena';
export type { FloodedRuinsWall } from './floodedRuinsArena';
export {
  HEDGE_MAZE_ARENA,
  HEDGE_MAZE_BOOK_SPOTS,
  HEDGE_MAZE_HEIGHT,
  HEDGE_MAZE_SPAWNS,
  HEDGE_MAZE_WALLS,
  HEDGE_MAZE_WIDTH,
} from './hedgeMazeArena';
export type { HedgeMazeWall } from './hedgeMazeArena';
export {
  TOASTER_DOCK_ARENA,
  TOASTER_DOCK_BOOK_SPOTS,
  TOASTER_DOCK_HEIGHT,
  TOASTER_DOCK_SPAWNS,
  TOASTER_DOCK_WALLS,
  TOASTER_DOCK_WIDTH,
} from './toasterDockArena';
export type { ToasterDockWall } from './toasterDockArena';
export {
  TWIN_LOG_RINK_ARENA,
  TWIN_LOG_RINK_BOOK_SPOTS,
  TWIN_LOG_RINK_HEIGHT,
  TWIN_LOG_RINK_SPAWNS,
  TWIN_LOG_RINK_WALLS,
  TWIN_LOG_RINK_WIDTH,
} from './twinLogRinkArena';
export type { TwinLogRinkWall } from './twinLogRinkArena';
export {
  HEX_GROVE_ARENA,
  HEX_GROVE_BOOK_SPOTS,
  HEX_GROVE_HEIGHT,
  HEX_GROVE_SPAWNS,
  HEX_GROVE_WALLS,
  HEX_GROVE_WIDTH,
} from './hexGroveArena';
export type { HexGroveWall } from './hexGroveArena';
export {
  STONE_RUINS_ARENA,
  STONE_RUINS_BOOK_SPOTS,
  STONE_RUINS_HEIGHT,
  STONE_RUINS_SPAWNS,
  STONE_RUINS_WALLS,
  STONE_RUINS_WIDTH,
} from './stoneRuinsArena';
export type { StoneRuinsWall } from './stoneRuinsArena';
export {
  CROSS_POND_ARENA,
  CROSS_POND_BOOK_SPOTS,
  CROSS_POND_HEIGHT,
  CROSS_POND_SPAWNS,
  CROSS_POND_WALLS,
  CROSS_POND_WIDTH,
} from './crossPondArena';
export type { CrossPondWall } from './crossPondArena';
export {
  DIAMOND_WALLS_ARENA,
  DIAMOND_WALLS_BOOK_SPOTS,
  DIAMOND_WALLS_HEIGHT,
  DIAMOND_WALLS_SPAWNS,
  DIAMOND_WALLS_WALLS,
  DIAMOND_WALLS_WIDTH,
} from './diamondWallsArena';
export type { DiamondWallsWall } from './diamondWallsArena';
export {
  BATTLE_ROYALE_FINAL,
  BATTLE_ROYALE_HOLD,
  BATTLE_ROYALE_SHRINK,
  finalBox,
  zoneAt,
  zoneOf,
} from './battleRoyale';
export { EXPLOSIVE_FUSE } from './explosive';
