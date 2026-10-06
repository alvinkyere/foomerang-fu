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
