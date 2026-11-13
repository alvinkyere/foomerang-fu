/**
 * The warm-up's pens opening (the HQ, foomerang-fu physics hq.mp4 2.53-2.87 s, the mug's pen, every 2nd frame at 60 fps; owner,
 * 2026-11-12: "it settles into the ground"): the lever struck, the whole pen turns the striker's colour at once; from 0.1 s each wall
 * sinks straight down into the ground (only its top a thin bar by 0.25 s), gone by 0.3 s. Pure: what a wall shows `t` seconds after
 * its lever was struck (undefined: not yet).
 */
export const PEN_OPEN_SECONDS = 0.3;

export interface PenWallPose {
  /** How far the wall has taken the striker's colour (0 its own lavender, 1 the colour). */
  readonly tint: number;
  /** How far it has sunk into the ground (0 standing, 1 its top level with the ground). */
  readonly sink: number;
  readonly visible: boolean;
}

export function penWallAt(t: number | undefined): PenWallPose {
  if (t === undefined || t < 0) return { tint: 0, sink: 0, visible: true };
  if (t >= PEN_OPEN_SECONDS) return { tint: 1, sink: 1, visible: false };
  const u = Math.min(1, Math.max(0, (t - 0.1) / (PEN_OPEN_SECONDS - 0.1)));
  return { tint: 1, sink: u * u * (3 - 2 * u), visible: true };
}
