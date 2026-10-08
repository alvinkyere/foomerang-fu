/**
 * Environment animation of a reconstructed map (e.g. sky_islands' rotating croissant): a pre-rendered sheet of N frames over one
 * MEASURED period, chosen from the clock. Presentation only — it never touches the simulation, and the hazard it depicts has no
 * gameplay effect (GAMEPLAY INTERACTION: DEFERRED). Pure, so it can be tested.
 */
export interface AnimatedProp {
  readonly key: string;
  readonly file: string;
  /** Top-left of every frame on the baked canvas. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly frames: number;
  readonly periodS: number;
  /** Per-frame depth key (canvas y of the prop's ground centroid in that frame). */
  readonly depths: readonly number[];
}

/** Which frame shows at `timeMs`: the elapsed fraction of the period, wrapped. */
export const animationFrame = (timeMs: number, periodS: number, frames: number): number => {
  const phase = (timeMs / 1000 / periodS) % 1;
  return Math.min(frames - 1, Math.floor((phase < 0 ? phase + 1 : phase) * frames));
};
