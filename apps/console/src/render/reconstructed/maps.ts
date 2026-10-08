import type { ArenaChoice } from '../../runtime/powerupMode';

/**
 * Maps reconstructed from the master gameplay video (art/reconstruction). A map is registered as DATA: where its baked assets
 * live and which pack character sits in each seat. Its camera, layers and character atlases ship in its manifest
 * (art/reconstruction/runtime/package_map.py), so the renderer has no per-map branches. Pure: no Phaser.
 */
export type PackCharacter =
  | 'avocado'
  | 'bacon'
  | 'banana'
  | 'bread'
  | 'carrot'
  | 'coffee'
  | 'donut'
  | 'icecream'
  | 'milk'
  | 'watermelon';

export interface ReconstructedMap {
  readonly id: ReconstructedArena;
  /** Under the public folder; holds manifest.json and the files it names. */
  readonly assetDir: string;
  /** Seats 1–6 in order (the map's video cast first, all from the purchased character pack). */
  readonly roster: readonly PackCharacter[];
  /** The rules arena's size in world units (checked against the rules data by the tests). */
  readonly arena: { readonly width: number; readonly height: number };
  /** Canvas colour behind the baked ground (only visible while it loads). */
  readonly background: string;
}

export type ReconstructedArena = Extract<
  ArenaChoice,
  'market_plaza' | 'harbour_fort' | 'sky_islands'
>;

export const RECONSTRUCTED_MAPS: Readonly<Record<ReconstructedArena, ReconstructedMap>> =
  Object.freeze({
    market_plaza: Object.freeze({
      id: 'market_plaza',
      assetDir: 'maps/market_plaza/',
      roster: Object.freeze([
        'bread',
        'coffee',
        'watermelon',
        'icecream',
        'banana',
        'carrot',
      ] as const),
      arena: Object.freeze({ width: 1750, height: 1300 }),
      background: '#efe6c4',
    }),
    // seats 1–2 are the shot's cast (S9: avocado, watermelon); 3–6 are pack characters not seen on this map
    harbour_fort: Object.freeze({
      id: 'harbour_fort',
      assetDir: 'maps/harbour_fort/',
      roster: Object.freeze([
        'avocado',
        'watermelon',
        'carrot',
        'bread',
        'coffee',
        'icecream',
      ] as const),
      arena: Object.freeze({ width: 1418, height: 854 }),
      background: '#56819a',
    }),
    // seats 1–2 are the shot's cast from the pack (S7: carrot, banana; its eggplant has no pack model yet); 3–6 are pack characters
    sky_islands: Object.freeze({
      id: 'sky_islands',
      assetDir: 'maps/sky_islands/',
      roster: Object.freeze([
        'carrot',
        'banana',
        'coffee',
        'bread',
        'watermelon',
        'icecream',
      ] as const),
      arena: Object.freeze({ width: 1315, height: 950 }),
      background: '#dfe8f0',
    }),
    // seats 1 is the shot's pack cast (S0: banana); its eggplant has no pack model yet; 2-6 are pack characters
    pond_garden: Object.freeze({
      id: 'pond_garden',
      assetDir: 'maps/pond_garden/',
      roster: Object.freeze([
        'banana',
        'carrot',
        'coffee',
        'bread',
        'watermelon',
        'icecream',
      ] as const),
      arena: Object.freeze({ width: 1216, height: 878 }),
      background: '#9fcf5c',
    }),
    // seat 1 is the shot's pack cast (S1: banana); its eggplant has no pack model yet; 2-6 are pack characters
    lakeshore: Object.freeze({
      id: 'lakeshore',
      assetDir: 'maps/lakeshore/',
      roster: Object.freeze([
        'banana',
        'carrot',
        'coffee',
        'bread',
        'watermelon',
        'icecream',
      ] as const),
      arena: Object.freeze({ width: 1106, height: 800 }),
      background: '#4f8a99',
    }),
    // seat 1 is the shot's pack cast (S2: carrot); its sushi has no pack model yet; 2-6 are pack characters
    farm_plots: Object.freeze({
      id: 'farm_plots',
      assetDir: 'maps/farm_plots/',
      roster: Object.freeze([
        'carrot',
        'banana',
        'coffee',
        'bread',
        'watermelon',
        'icecream',
      ] as const),
      arena: Object.freeze({ width: 1106, height: 803 }),
      background: '#9fd06a',
    }),
  });

export const reconstructedMapFor = (arena: ArenaChoice): ReconstructedMap | undefined =>
  Object.hasOwn(RECONSTRUCTED_MAPS, arena)
    ? RECONSTRUCTED_MAPS[arena as ReconstructedArena]
    : undefined;

/** The pack character in seat `number` (1-based), cycling through the roster. */
export const characterFor = (roster: readonly PackCharacter[], number: number): PackCharacter =>
  roster[Math.max(0, number - 1) % roster.length] as PackCharacter;

/** Which of the N baked headings shows a character facing world direction (fx, fy) (world y grows toward the viewer). */
export const headingFrame = (fx: number, fy: number, n = 16): number => {
  const yaw = Math.atan2(fx, fy);
  return ((Math.round(yaw / ((2 * Math.PI) / n)) % n) + n) % n;
};
