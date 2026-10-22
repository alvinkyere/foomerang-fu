/**
 * An armed Explosive boomerang ticking where it landed, as the reference video draws it (foomerang-fu physics hq.mp4, 5:21.95–
 * 5:22.47, every frame at 60 fps; art/physics_reference/README.md, "The Explosive's tick"). Pure: what shows with `left` seconds
 * until it goes off. The ticks come faster as it nears the blast (gaps 0.13, 0.13, 0.10 s):
 *
 *   0.467–0.417  a white bloom swallows it (≈ 1.5 character widths across), then its halo fades to 0.35
 *   0.333–0.267  the boomerang itself flashes white
 *   0.200–0.150  it flashes white again
 *   0.100–0.050  a white bloom swallows it again, its halo fading until the blast
 */
export const EXPLOSIVE_TICK = Object.freeze({
  blooms: Object.freeze([
    Object.freeze({ from: 0.467, full: 0.417, gone: 0.35 }),
    Object.freeze({ from: 0.1, full: 0.05, gone: 0 }),
  ]),
  flashes: Object.freeze([
    Object.freeze({ from: 0.333, to: 0.267 }),
    Object.freeze({ from: 0.2, to: 0.15 }),
  ]),
  /** The bloom's diameter, character widths. */
  bloomWidths: 1.5,
  /** The boomerang's colour while it flashes. */
  flash: '#fff3f6',
});

/** With `left` seconds to go: how strong the bloom is (0–1) and whether the boomerang itself flashes white. */
export function tickAt(left: number): { readonly bloom: number; readonly flash: boolean } {
  let bloom = 0;
  for (const b of EXPLOSIVE_TICK.blooms) {
    if (left <= b.from && left > b.full) bloom = 1;
    else if (left <= b.full && left > b.gone)
      bloom = Math.max(bloom, (left - b.gone) / (b.full - b.gone));
  }
  const flash = EXPLOSIVE_TICK.flashes.some((f) => left <= f.from && left > f.to);
  return { bloom, flash };
}
