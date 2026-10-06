/**
 * Garden's readability rule, as pure data. A wall or boulder that stands IN FRONT of a living player (it is nearer the
 * camera) and overlaps that player's silhouette on screen is "hiding" them; the renderer fades exactly those solids while
 * they hide someone. Nothing else is ever transparent, so Garden keeps its solid, chunky look.
 */
export interface ScreenRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface Occluder {
  /** Painter's depth: the screen row of the solid's ground edge nearest the camera. */
  readonly depth: number;
  readonly box: ScreenRect;
}

export interface Seen {
  /** Painter's depth: the screen row of the person's feet. */
  readonly depth: number;
  readonly box: ScreenRect;
}

const overlaps = (a: ScreenRect, b: ScreenRect): boolean =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** For each solid: does it hide at least one of the people? (`margin` px of depth is ignored: a person leaning on a wall is beside it, not behind it.) */
export function hidingSolids(
  solids: readonly Occluder[],
  people: readonly Seen[],
  margin = 1,
): boolean[] {
  return solids.map((solid) =>
    people.some((p) => solid.depth > p.depth + margin && overlaps(solid.box, p.box)),
  );
}
