import type { PowerKind } from '@foomerang/foomerang-fu';

/**
 * How quickly pickups appear, chosen in the console's page address (`?powerups=`), for playtesting and
 * automated checks: `low` / `normal` / `high` (the shipped spawn rates: scarce Books, one at a time),
 * `fast` (DEVELOPER ONLY: a Book a second, up to five lying around, so powers can be tried within
 * seconds; it is not the game) or `off` (no Books at all).
 * Anything else in the address means `normal`: a link cannot make the console run arbitrary rules.
 */
export type PowerupMode = 'normal' | 'low' | 'high' | 'fast' | 'off';

export function parsePowerupsParam(search: string): PowerupMode {
  const value = new URLSearchParams(search).get('powerups');
  return value === 'fast' || value === 'off' || value === 'low' || value === 'high'
    ? value
    : 'normal';
}

/**
 * Which powers a Book may award, from the page address (`?enable=SHIELD,EXTRA_BOOMERANG`): the match's
 * enabled power pool, for playtesting one power at a time. Unknown names are ignored; no valid names
 * (or no parameter) means the default pool (all of them).
 */
const KNOWN: readonly PowerKind[] = [
  'CAFFEINATED',
  'EXPLOSIVE_BOOMERANG',
  'SHIELD',
  'EXTRA_BOOMERANG',
  'MULTI_BOOMERANG',
  'ICE_BOOMERANG',
  'FIRE_BOOMERANG',
  'BATTLE_ROYALE',
  'TELEPORT_BOOMERANG',
  'TELEKINESIS',
];
export function parseEnabledParam(search: string): PowerKind[] | undefined {
  const raw = new URLSearchParams(search).get('enable');
  if (raw === null) return undefined;
  const wanted = raw.split(',').map((name) => name.trim());
  const valid = KNOWN.filter((kind) => wanted.includes(kind));
  return valid.length === 0 ? undefined : valid;
}

/**
 * DEVELOPER ONLY: powers every player holds from the start of the match (`?give=EXPLOSIVE_BOOMERANG`), to test a power at once
 * (owner, 2026-11-06: "make it possible to test explosive boomerang"). Unknown names are ignored; none valid means none given.
 */
export function parseGiveParam(search: string): PowerKind[] | undefined {
  const raw = new URLSearchParams(search).get('give');
  if (raw === null) return undefined;
  const wanted = raw.split(',').map((name) => name.trim());
  const valid = KNOWN.filter((kind) => wanted.includes(kind));
  return valid.length === 0 ? undefined : valid;
}

/**
 * How many kills win a Free For All (`?kills=3`), for playtesting and automated checks only: 1–14, so a match can be
 * seen to its end in seconds. The game is 14; no parameter (or anything else) means 14.
 */
export function parseKillsParam(search: string): number | undefined {
  const raw = new URLSearchParams(search).get('kills');
  if (raw === null || !/^\d{1,2}$/.test(raw)) return undefined;
  const n = Number(raw);
  return n >= 1 && n <= 14 && n !== 14 ? n : undefined;
}

/**
 * A pinned map (`?arena=`): for development and tests only. `systems` and `primitive` are the test
 * arenas; the reconstructed maps are named as in the table. Absent or unknown (the removed Garden
 * included): no pin.
 */
export const ARENA_CHOICES = [
  'primitive',
  'systems',
  'market_plaza',
  'gong_islands',
  'harbour_fort',
  'sky_islands',
  'pond_garden',
  'lakeshore',
  'farm_plots',
  'flooded_ruins',
  'hedge_maze',
  'toaster_dock',
  'twin_log_rink',
  'hex_grove',
  'stone_ruins',
  'cross_pond',
  'pond_cross',
  'lily_island',
  'autumn_glade',
  'hex_meadow',
  'temple_court',
  'bridge_islands',
  'diamond_walls',
] as const;
export type ArenaChoice = (typeof ARENA_CHOICES)[number];
export const parseArenaParam = (search: string): ArenaChoice | undefined => {
  const given = new URLSearchParams(search).get('arena');
  // `?arena=pond`: the cross pond (the owner tests it there, 2026-10-27)
  // `?arena=meadow`: the hex meadow (ff physics hq 2.mp4 20:02), tested outside the rotation
  // `?arena=temple`: the temple court (ff physics hq 2.mp4 2:01), outside the rotation
  // `?arena=glade`: the autumn glade (ff physics hq 2.mp4 10:26), tested outside the rotation (owner, 2026-11-01)
  // `?arena=lily` (or `island`): the lily island (HQ1 10:37), tested outside the rotation (owner, 2026-10-30)
  const value =
    given === 'pond'
      ? 'pond_cross'
      : given === 'island' || given === 'lily'
        ? 'lily_island'
        : given === 'glade'
          ? 'autumn_glade'
          : given === 'bridge'
            ? 'bridge_islands'
            : given === 'meadow'
              ? 'hex_meadow'
              : given === 'temple'
                ? 'temple_court'
                : given;
  return (ARENA_CHOICES as readonly (string | null)[]).includes(value)
    ? (value as ArenaChoice)
    : undefined;
};

/**
 * The map the product plays: the rotation (the market plaza, the gong islands and the cross pond, a new one every round:
 * the owner, 2026-10-27, "I don't see the rotation in effect"; from 2026-10-22 it had been the gong islands only; the cross pond
 * joined it on 2026-10-30). Any `?arena=` map pins that map for development and tests;
 * `?arena=product` is the rotation too. (The rotation of every
 * reconstructed map, `'rotate'`, stays available to the runtime.)
 */
export const productArena = (search: string): ArenaChoice | 'product' =>
  parseArenaParam(search) ?? 'product';
