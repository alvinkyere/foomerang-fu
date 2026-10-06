/**
 * How quickly pickups appear, chosen in the console's page address (`?powerups=`), for playtesting and
 * automated checks: `normal` (the schedule the rules ship with), `fast` (a pickup every second, up to
 * five lying around, so every power can be tried within seconds) or `off` (no pickups at all).
 * Anything else in the address means `normal`: a link cannot make the console run arbitrary rules.
 */
export type PowerupMode = 'normal' | 'fast' | 'off';

export function parsePowerupsParam(search: string): PowerupMode {
  const value = new URLSearchParams(search).get('powerups');
  return value === 'fast' || value === 'off' ? value : 'normal';
}
