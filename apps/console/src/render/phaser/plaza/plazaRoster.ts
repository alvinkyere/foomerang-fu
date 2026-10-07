/** Pure presentation helpers for market_plaza (no Phaser), shared by the renderer and its tests. */
/** Seats 1–6 (the plaza's video cast, all from the purchased character pack). */
export const PLAZA_ROSTER = [
  'bread',
  'coffee',
  'watermelon',
  'icecream',
  'banana',
  'carrot',
] as const;
export type PlazaCharacter = (typeof PLAZA_ROSTER)[number];
export const plazaCharacterFor = (number: number): PlazaCharacter =>
  PLAZA_ROSTER[Math.max(0, number - 1) % PLAZA_ROSTER.length] as PlazaCharacter;

/** Which of the N baked headings shows a character facing world direction (fx, fy) (world y grows toward the viewer). */
export const headingFrame = (fx: number, fy: number, n = 16): number => {
  const yaw = Math.atan2(fx, fy);
  return (((Math.round(yaw / ((2 * Math.PI) / n)) % n) + n) % n) as number;
};
