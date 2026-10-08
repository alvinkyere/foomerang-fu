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
 * Which powers a Book may award, from the page address (`?enable=GUARD,PHASE_DASH`): the match's
 * enabled power pool, for playtesting one power at a time. Unknown names are ignored; no valid names
 * (or no parameter) means the default pool (all five).
 */
const KNOWN: readonly PowerKind[] = [
  'OVERDRIVE',
  'BLAST_BOOMERANG',
  'GUARD',
  'TWIN_THROW',
  'PHASE_DASH',
];
export function parseEnabledParam(search: string): PowerKind[] | undefined {
  const raw = new URLSearchParams(search).get('enable');
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
 * Which arena to play (`?arena=`): `garden` (the default, the Slice 9 production arena), `systems` (the Slice 6 experimental
 * arena with gates, platforms and a hazard), `primitive` (the Slice 2 test arena the earlier slices were played in) or
 * a map reconstructed from the master gameplay video (`market_plaza`, `harbour_fort`, `sky_islands`). Anything else is Garden.
 */
export const ARENA_CHOICES = [
  'primitive',
  'systems',
  'garden',
  'market_plaza',
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
] as const;
export type ArenaChoice = (typeof ARENA_CHOICES)[number];
export const parseArenaParam = (search: string): ArenaChoice => {
  const value = new URLSearchParams(search).get('arena');
  return (ARENA_CHOICES as readonly (string | null)[]).includes(value)
    ? (value as ArenaChoice)
    : 'garden';
};
