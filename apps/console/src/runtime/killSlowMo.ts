/**
 * A kill's freeze and slow motion, as the HQ video plays them (the donut 1:03.85, the coffee mug 2:21.18; measured from the
 * camera's pan, which follows the players): the game stops dead for 0.1 s (six identical frames), then runs at ≈ 0.2× (the
 * camera crawls at a fifth of its pace) until 1.1 s after the hit, and is back to full speed by 1.35 s. A fall has none
 * (the sushi, 7:59.5: the frames change evenly). The remains' motions were measured in the video's own time, so they stay
 * on the real clock; only the game's clock slows. Pure.
 */
export const KILL_SLOW_MO = Object.freeze({
  freeze: 0.1,
  speed: 0.2,
  slowUntil: 1.1,
  backAt: 1.35,
});

/** How fast the game runs `since` real seconds after a kill (1: normal). */
export function killTimeScale(since: number): number {
  const { freeze, speed, slowUntil, backAt } = KILL_SLOW_MO;
  if (since < 0 || since >= backAt) return 1;
  if (since < freeze) return 0;
  if (since < slowUntil) return speed;
  return speed + ((1 - speed) * (since - slowUntil)) / (backAt - slowUntil);
}

/** Game time that passes over the real interval [from, to] seconds after a kill (the integral of the scale). */
export function gameSecondsBetween(from: number, to: number): number {
  const pts = [from, ...Object.values(KILL_SLOW_MO).filter((p) => p > from && p < to), to];
  let sum = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1] as number;
    const b = pts[i] as number;
    sum += ((killTimeScale(a + 1e-9) + killTimeScale(b - 1e-9)) / 2) * (b - a);
  }
  return sum;
}
