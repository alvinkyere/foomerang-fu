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

export type ReconstructedArena = Extract<ArenaChoice, 'market_plaza'>;

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
