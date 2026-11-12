/**
 * The warm-up's pens opening (the HQ, foomerang-fu physics hq.mp4 2.53-2.87 s, the mug's pen, every 2nd frame at 60 fps): the lever struck,
 * the whole pen turns the striker's colour at once; from 0.1 s each wall tips over outwards (about its outer foot), lying flat by 0.25 s;
 * it fades from 0.25 s and is gone by 0.32 s. Pure: what a wall shows `t` seconds after its lever was struck (undefined: not yet).
 */
export const PEN_OPEN_SECONDS = 0.32;

export interface PenWallPose {
  /** How far the wall has taken the striker's colour (0 its own lavender, 1 the colour). */
  readonly tint: number;
  /** How far it has tipped over (0 upright, 1 flat on the ground, outwards). */
  readonly tip: number;
  readonly opacity: number;
  readonly visible: boolean;
}

export function penWallAt(t: number | undefined): PenWallPose {
  if (t === undefined || t < 0) return { tint: 0, tip: 0, opacity: 1, visible: true };
  if (t >= PEN_OPEN_SECONDS) return { tint: 1, tip: 1, opacity: 0, visible: false };
  const u = Math.min(1, Math.max(0, (t - 0.1) / 0.15));
  return {
    tint: 1,
    tip: u * u,
    opacity: t < 0.25 ? 1 : 1 - (t - 0.25) / (PEN_OPEN_SECONDS - 0.25),
    visible: true,
  };
}
