/**
 * A character's hands, drawn by the game rather than baked into its sprite, so they can hold its boomerang, swing and walk (the
 * reference video and the store's full-HD shots: every character holds its boomerang in one of two small rounded-cube hands
 * that float at its sides). The plaza manifest records, for every frame of the hands-off atlas (body_<name>.webp), where each
 * hand was in Blender units from the ground point under the body (art/reconstruction/runtime/package_bodies.py). The 3D plaza is
 * built in those units (a Blender point (X, Y, Z) is the scene point (X, Z, -Y)) and draws characters `characterScale` times
 * their baked size. Pure: parsing and maths, no three.js.
 */
export interface CharacterHands {
  /** The video's hand colour (game-setting.mp4; select_look.json). */
  readonly colour: string;
  /** A hand's size (its largest extent), Blender units as baked. */
  readonly size: number;
  /** Per atlas row (stand / air), per heading (16), [left, right] hand: [x, y, z] Blender units from the ground point. */
  readonly frames: {
    readonly stand: readonly (readonly [Vec3, Vec3])[];
    readonly air: readonly (readonly [Vec3, Vec3])[];
  };
}

type Vec3 = readonly [number, number, number];

export interface SceneOffset {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const HEADINGS = 16;

const vec3 = (v: unknown): Vec3 | undefined =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))
    ? (v as unknown as Vec3)
    : undefined;

const row = (r: unknown): (readonly [Vec3, Vec3])[] | undefined => {
  if (!Array.isArray(r) || r.length !== HEADINGS) return undefined;
  const out: (readonly [Vec3, Vec3])[] = [];
  for (const f of r) {
    if (!Array.isArray(f) || f.length !== 2) return undefined;
    const a = vec3(f[0]);
    const b = vec3(f[1]);
    if (a === undefined || b === undefined) return undefined;
    out.push([a, b]);
  }
  return out;
};

/** A character's hands from the manifest, or undefined if it has none or they are malformed (it keeps its baked ones). */
export function parseHands(raw: unknown): CharacterHands | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r['colour'] !== 'string' || !/^#[0-9a-f]{6}$/i.test(r['colour'])) return undefined;
  const size = r['size'];
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) return undefined;
  const frames = r['frames'] as Record<string, unknown> | undefined;
  const stand = row(frames?.['stand']);
  const air = row(frames?.['air']);
  if (stand === undefined || air === undefined) return undefined;
  return { colour: r['colour'], size, frames: { stand, air } };
}

/** Where each hand is, [left, right], from the ground point under the body, in scene units, for the atlas frame shown. */
export function handOffsets(
  hands: CharacterHands,
  heading: number,
  airborne: boolean,
  characterScale: number,
): readonly [SceneOffset, SceneOffset] {
  const f = (airborne ? hands.frames.air : hands.frames.stand)[
    ((heading % HEADINGS) + HEADINGS) % HEADINGS
  ] as readonly [Vec3, Vec3];
  const scene = ([x, y, z]: Vec3): SceneOffset => ({
    x: x * characterScale,
    y: z * characterScale,
    z: -y * characterScale + 0, // (+ 0: never -0)
  });
  return [scene(f[0]), scene(f[1])];
}
