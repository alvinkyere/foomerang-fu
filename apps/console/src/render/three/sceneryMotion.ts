/**
 * What a map's scenery does while a round plays: whether a tall thing between the camera and a player turns see-through (`fade`, the
 * plaza's: nobody hidden) and whether its trees sway and its pennants swing (`sway`). The plaza's both; a map's manifest may say
 * otherwise (`scenery`): the temple court's HQ shows neither (owner, 2026-11-11; its crowns move under 1 px against their planters
 * while the camera holds still, its banners hang still). The manifest is the map's own data: checked, not trusted.
 */
export interface SceneryMotion {
  readonly fade: boolean;
  readonly sway: boolean;
}

export function sceneryMotion(manifest: unknown): SceneryMotion {
  const s = (manifest as { scenery?: unknown } | null)?.scenery;
  const r = s !== null && typeof s === 'object' ? (s as Record<string, unknown>) : {};
  return {
    fade: typeof r['fade'] === 'boolean' ? r['fade'] : true,
    sway: typeof r['sway'] === 'boolean' ? r['sway'] : true,
  };
}
