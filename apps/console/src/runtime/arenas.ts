import type { Vec2 } from '@foomerang/game-core';
import {
  GARDEN_ARENA,
  GARDEN_BOOK_SPOTS,
  HARBOUR_FORT_ARENA,
  HARBOUR_FORT_BOOK_SPOTS,
  SKY_ISLANDS_ARENA,
  SKY_ISLANDS_BOOK_SPOTS,
  MARKET_PLAZA_ARENA,
  MARKET_PLAZA_BOOK_SPOTS,
  PRIMITIVE_ARENA,
  PRIMITIVE_POWERUPS,
  SYSTEMS_ARENA,
  SYSTEMS_POWERUP_SPOTS,
  POND_GARDEN_ARENA,
  POND_GARDEN_BOOK_SPOTS,
  LAKESHORE_ARENA,
  LAKESHORE_BOOK_SPOTS,
  FARM_PLOTS_ARENA,
  FARM_PLOTS_BOOK_SPOTS,
  type FuArena,
} from '@foomerang/foomerang-fu';
import type { ArenaChoice } from './powerupMode';

/**
 * Every playable arena as DATA: the rules arena and where Books may appear. The runtime, the view and the renderer look arenas up
 * here (and reconstructed maps in render/reconstructed/maps.ts) instead of branching on each one, so a new map is a new row.
 */
export interface PlayableArena {
  readonly arena: FuArena;
  /** Where Books may appear; an arena without spots has no Books. */
  readonly bookSpots: readonly Vec2[] | undefined;
  /** A production arena the view names to the renderer (Garden and the reconstructed maps); test arenas are unnamed. */
  readonly named: boolean;
}

export const PLAYABLE_ARENAS: Readonly<Record<ArenaChoice, PlayableArena>> = Object.freeze({
  primitive: { arena: PRIMITIVE_ARENA, bookSpots: PRIMITIVE_POWERUPS.spots, named: false },
  systems: { arena: SYSTEMS_ARENA, bookSpots: SYSTEMS_POWERUP_SPOTS, named: false },
  garden: { arena: GARDEN_ARENA, bookSpots: GARDEN_BOOK_SPOTS, named: true },
  market_plaza: { arena: MARKET_PLAZA_ARENA, bookSpots: MARKET_PLAZA_BOOK_SPOTS, named: true },
  harbour_fort: { arena: HARBOUR_FORT_ARENA, bookSpots: HARBOUR_FORT_BOOK_SPOTS, named: true },
  sky_islands: { arena: SKY_ISLANDS_ARENA, bookSpots: SKY_ISLANDS_BOOK_SPOTS, named: true },
  pond_garden: { arena: POND_GARDEN_ARENA, bookSpots: POND_GARDEN_BOOK_SPOTS, named: true },
  lakeshore: { arena: LAKESHORE_ARENA, bookSpots: LAKESHORE_BOOK_SPOTS, named: true },
  farm_plots: { arena: FARM_PLOTS_ARENA, bookSpots: FARM_PLOTS_BOOK_SPOTS, named: true },
});

/** Which arena choice a rules arena is (undefined for an arena not in the table). */
export const choiceOf = (arena: FuArena): ArenaChoice | undefined =>
  (Object.keys(PLAYABLE_ARENAS) as ArenaChoice[]).find((k) => PLAYABLE_ARENAS[k].arena === arena);
