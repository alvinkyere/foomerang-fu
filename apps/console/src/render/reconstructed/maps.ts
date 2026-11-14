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
  | 'market_plaza'
  | 'gong_islands'
  | 'pond_cross'
  | 'lily_island'
  | 'autumn_glade'
  | 'hex_meadow'
  | 'warm_up'
  | 'temple_court'
  | 'gong_court'
  | 'canal_court'
  | 'bridge_islands'
  | 'harbour_fort'
  | 'sky_islands'
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
      arena: Object.freeze({ width: 2209, height: 1418 }),
      background: '#efe6c4',
    }),
    // the HQ's lime island in the water (art/lily_island, HQ1 10:37): the plaza's camera and characters, its own island
    lily_island: Object.freeze({
      id: 'lily_island',
      assetDir: 'maps/lily_island/',
      roster: Object.freeze([
        'bread',
        'coffee',
        'watermelon',
        'icecream',
        'banana',
        'carrot',
      ] as const),
      arena: Object.freeze({ width: 1209, height: 1044 }),
      background: '#7aa8bb',
    }),
    // the HQ's warm-up (art/warm_up, foomerang-fu physics hq.mp4 0:00): the practice round's island, moat and pens
    warm_up: Object.freeze({
      id: 'warm_up',
      assetDir: 'maps/warm_up/',
      roster: Object.freeze([
        'bread',
        'coffee',
        'watermelon',
        'icecream',
        'banana',
        'carrot',
      ] as const),
      arena: Object.freeze({ width: 2198, height: 2143 }),
      background: '#9cc98a',
    }),
    // the HQ's hex meadow (art/hex_meadow, ff physics hq 2.mp4 20:02): the plaza's camera and characters, its plants drawn by the game
    hex_meadow: Object.freeze({
      id: 'hex_meadow',
      assetDir: 'maps/hex_meadow/',
      roster: Object.freeze([
        'bread',
        'coffee',
        'watermelon',
        'icecream',
        'banana',
        'carrot',
      ] as const),
      arena: Object.freeze({ width: 2017, height: 1703 }),
      background: '#bee781',
    }),
    // the HQ's gong court (art/gong_court, foomerang-fu physics hq.mp4 0:35): the plaza's camera and characters, its own court
    gong_court: Object.freeze({
      id: 'gong_court',
      assetDir: 'maps/gong_court/',
      roster: Object.freeze([
        'bread',
        'coffee',
        'watermelon',
        'icecream',
        'banana',
        'carrot',
      ] as const),
      arena: Object.freeze({ width: 1044, height: 1058 }),
      background: '#93c786',
    }),
    // the HQ's canal court (art/canal_court, foomerang-fu physics hq.mp4 10:55): the plaza's camera and characters, its own court
    canal_court: Object.freeze({
      id: 'canal_court',
      assetDir: 'maps/canal_court/',
      roster: Object.freeze([
        'bread',
        'coffee',
        'watermelon',
        'icecream',
        'banana',
        'carrot',
      ] as const),
      arena: Object.freeze({ width: 1704, height: 1154 }),
      background: '#f9e88a',
    }),
    // the HQ's temple court (art/temple_court, ff physics hq 2.mp4 2:01): the plaza's camera and characters, its hex fields drawn by the game
    temple_court: Object.freeze({
      id: 'temple_court',
      assetDir: 'maps/temple_court/',
      roster: Object.freeze([
        'bread',
        'coffee',
        'watermelon',
        'icecream',
        'banana',
        'carrot',
      ] as const),
      arena: Object.freeze({ width: 2429, height: 1795 }),
      background: '#f8e68a',
    }),
    // the HQ's autumn glade (art/autumn_glade, ff physics hq 2.mp4 10:26): the plaza's camera and characters, its own clearing
    autumn_glade: Object.freeze({
      id: 'autumn_glade',
      assetDir: 'maps/autumn_glade/',
      roster: Object.freeze([
        'bread',
        'coffee',
        'watermelon',
        'icecream',
        'banana',
        'carrot',
      ] as const),
      arena: Object.freeze({ width: 2226, height: 1759 }),
      background: '#f9e589',
    }),
    // the HQ's two islands and their brick bridge (art/bridge_islands, HQ1 10:37): the plaza's camera and characters, its own islands
    bridge_islands: Object.freeze({
      id: 'bridge_islands',
      assetDir: 'maps/bridge_islands/',
      roster: Object.freeze([
        'bread',
        'coffee',
        'watermelon',
        'icecream',
        'banana',
        'carrot',
      ] as const),
      arena: Object.freeze({ width: 1814, height: 1539 }),
      background: '#7aa8bb',
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
    // the sky islands of the HQ videos (art/sky_islands): the plaza's camera and characters, its own islands
    gong_islands: Object.freeze({
      id: 'gong_islands',
      assetDir: 'maps/gong_islands/',
      roster: Object.freeze([
        'bread',
        'coffee',
        'watermelon',
        'icecream',
        'banana',
        'carrot',
      ] as const),
      arena: Object.freeze({ width: 2034, height: 1566 }),
      background: '#e5f3de',
    }),
    // the HQ's stone-walled pond with the turning raft (art/pond_cross): the plaza's camera and characters, its own pond
    pond_cross: Object.freeze({
      id: 'pond_cross',
      assetDir: 'maps/pond_cross/',
      roster: Object.freeze([
        'bread',
        'coffee',
        'watermelon',
        'icecream',
        'banana',
        'carrot',
      ] as const),
      arena: Object.freeze({ width: 1841, height: 1649 }),
      background: '#7da9be',
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
    // seat 1 is the shot's pack cast (S8: banana); 2-6 are pack characters
    flooded_ruins: Object.freeze({
      id: 'flooded_ruins',
      assetDir: 'maps/flooded_ruins/',
      roster: Object.freeze([
        'banana',
        'carrot',
        'coffee',
        'bread',
        'watermelon',
        'icecream',
      ] as const),
      arena: Object.freeze({ width: 1154, height: 834 }),
      background: '#4d7f86',
    }),
    // seats 1-5 are the shot's pack cast (S11: carrot, banana, coffee, icecream, bread); its eggplant has no pack model yet
    hedge_maze: Object.freeze({
      id: 'hedge_maze',
      assetDir: 'maps/hedge_maze/',
      roster: Object.freeze([
        'carrot',
        'banana',
        'coffee',
        'icecream',
        'bread',
        'watermelon',
      ] as const),
      arena: Object.freeze({ width: 1871, height: 1352 }),
      background: '#a7d46a',
    }),
    // seats 1-2 are the shot's pack cast (S12: banana, carrot); its eggplant has no pack model yet
    toaster_dock: Object.freeze({
      id: 'toaster_dock',
      assetDir: 'maps/toaster_dock/',
      roster: Object.freeze([
        'banana',
        'carrot',
        'bread',
        'coffee',
        'watermelon',
        'icecream',
      ] as const),
      arena: Object.freeze({ width: 1169, height: 778 }),
      background: '#e9cf7a',
    }),
    // seats 1-2 are the shots' pack cast (S13/S18/S19: banana, carrot); its eggplant and sushi have no pack model yet
    twin_log_rink: Object.freeze({
      id: 'twin_log_rink',
      assetDir: 'maps/twin_log_rink/',
      roster: Object.freeze([
        'banana',
        'carrot',
        'icecream',
        'bread',
        'coffee',
        'watermelon',
      ] as const),
      arena: Object.freeze({ width: 1782, height: 1171 }),
      background: '#efe7cf',
    }),
    // seat 1 is the shot's pack cast (S14: bacon); 2-6 are pack characters
    hex_grove: Object.freeze({
      id: 'hex_grove',
      assetDir: 'maps/hex_grove/',
      roster: Object.freeze([
        'bacon',
        'carrot',
        'banana',
        'coffee',
        'bread',
        'watermelon',
      ] as const),
      arena: Object.freeze({ width: 1675, height: 1211 }),
      background: '#a9cf6c',
    }),
    // seat 1 is the shot's pack cast (S15: carrot); 2-6 are pack characters
    stone_ruins: Object.freeze({
      id: 'stone_ruins',
      assetDir: 'maps/stone_ruins/',
      roster: Object.freeze([
        'carrot',
        'banana',
        'coffee',
        'bread',
        'watermelon',
        'icecream',
      ] as const),
      arena: Object.freeze({ width: 1330, height: 962 }),
      background: '#c9df9a',
    }),
    // seats 1-2 are the shot's pack cast (S16: carrot, banana); its eggplant and sushi have no pack model yet
    cross_pond: Object.freeze({
      id: 'cross_pond',
      assetDir: 'maps/cross_pond/',
      roster: Object.freeze([
        'carrot',
        'banana',
        'bread',
        'coffee',
        'watermelon',
        'icecream',
      ] as const),
      arena: Object.freeze({ width: 1606, height: 1160 }),
      background: '#4f8fa0',
    }),
    // seats 1-3 are the shot's pack cast (S17: avocado, carrot, icecream); its eggplant has no pack model yet
    diamond_walls: Object.freeze({
      id: 'diamond_walls',
      assetDir: 'maps/diamond_walls/',
      roster: Object.freeze([
        'avocado',
        'carrot',
        'icecream',
        'banana',
        'bread',
        'coffee',
      ] as const),
      arena: Object.freeze({ width: 1760, height: 1271 }),
      background: '#b9d977',
    }),
  });

export const reconstructedMapFor = (arena: ArenaChoice): ReconstructedMap | undefined =>
  Object.hasOwn(RECONSTRUCTED_MAPS, arena)
    ? RECONSTRUCTED_MAPS[arena as ReconstructedArena]
    : undefined;

/** The pack character in seat `number` (1-based), cycling through the roster. */
export const characterFor = (roster: readonly PackCharacter[], number: number): PackCharacter =>
  roster[Math.max(0, number - 1) % roster.length] as PackCharacter;

/**
 * Who a circle is drawn as: the character its player chose in character select, else its seat's own on this map. `has`
 * says which characters this map has art for (a reconstructed map bakes only its own roster): a choice it cannot draw is
 * drawn as the seat's own, never not at all.
 */
export const characterOf = (
  roster: readonly PackCharacter[],
  circle: { readonly number: number; readonly character?: PackCharacter | undefined },
  has: (kind: PackCharacter) => boolean = () => true,
): PackCharacter =>
  circle.character !== undefined && has(circle.character)
    ? circle.character
    : characterFor(roster, circle.number);

/** Which of the N baked headings shows a character facing world direction (fx, fy) (world y grows toward the viewer). */
export const headingFrame = (fx: number, fy: number, n = 16): number => {
  const yaw = Math.atan2(fx, fy);
  return ((Math.round(yaw / ((2 * Math.PI) / n)) % n) + n) % n;
};
