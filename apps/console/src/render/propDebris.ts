/**
 * What a broken crate or pot bursts into (presentation only; the rules decide THAT it broke). As in the reference video
 * (02:21), the pieces pop up and scatter outward, mostly away from whoever broke it, land, slide a little and stay on the
 * ground until the round ends. Pure and seeded by the prop's id, so a replay looks the same. Every length is in units of the
 * prop's own size (1 = its width), every time in seconds since it broke; the renderer scales and places it.
 */

export type DebrisKind = 'CRATE' | 'POT';

export interface DebrisPiece {
  /** Where it starts, relative to the prop's centre on the ground (y up). */
  readonly offset: { readonly x: number; readonly y: number; readonly z: number };
  readonly velocity: { readonly x: number; readonly y: number; readonly z: number };
  /** Spin while it flies, radians per second about each axis. */
  readonly spin: { readonly x: number; readonly y: number; readonly z: number };
  /** Its box: y is its thickness (lying flat it rests at half of it). */
  readonly size: { readonly x: number; readonly y: number; readonly z: number };
  /** Multiplies the prop's colour (a little lighter or darker per piece). */
  readonly shade: number;
}

export interface DebrisPose {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly rotation: { readonly x: number; readonly y: number; readonly z: number };
  readonly resting: boolean;
}

const GRAVITY = 22;
/** After landing a piece slides to a stop over this long. */
const SLIDE = 0.25;

const SHAPES: Record<DebrisKind, readonly { size: DebrisPiece['size']; count: number }[]> = {
  // a crate: its planks and a few splinters
  CRATE: [
    { size: { x: 0.9, y: 0.12, z: 0.22 }, count: 6 },
    { size: { x: 0.25, y: 0.12, z: 0.18 }, count: 4 },
  ],
  // a pot: curved shards (thin tiles)
  POT: [
    { size: { x: 0.34, y: 0.07, z: 0.3 }, count: 6 },
    { size: { x: 0.2, y: 0.06, z: 0.18 }, count: 5 },
  ],
};

/** A small deterministic generator (mulberry32) seeded from a string (FNV-1a). */
function randomFrom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The pieces a prop breaks into. `away`: the direction (on the ground) away from whoever broke it, if anyone. */
export function debrisFor(
  kind: DebrisKind,
  away: { readonly x: number; readonly z: number } | undefined,
  id: string,
): DebrisPiece[] {
  const random = randomFrom(id);
  const between = (lo: number, hi: number) => lo + (hi - lo) * random();
  const shapes = SHAPES[kind];
  const total = shapes.reduce((n, s) => n + s.count, 0);
  const heading = away === undefined ? undefined : Math.atan2(away.z, away.x);
  const pieces: DebrisPiece[] = [];
  let n = 0;
  for (const shape of shapes)
    for (let i = 0; i < shape.count; i += 1, n += 1) {
      // three in four fly within 60 degrees of `away`; the rest (and all of them with no `away`) go evenly all round
      const even = (n / total) * Math.PI * 2 + between(-0.3, 0.3);
      const angle =
        heading !== undefined && n % 4 !== 3 ? heading + between(-Math.PI / 3, Math.PI / 3) : even;
      const speed = between(1.5, 3.5);
      pieces.push({
        offset: { x: between(-0.25, 0.25), y: between(0.3, 0.8), z: between(-0.25, 0.25) },
        velocity: { x: Math.cos(angle) * speed, y: between(3, 5), z: Math.sin(angle) * speed },
        spin: { x: between(-12, 12), y: between(-8, 8), z: between(-12, 12) },
        size: shape.size,
        shade: between(0.78, 1.05),
      });
    }
  return pieces;
}

/** Where a piece is `t` seconds after the prop broke. */
export function debrisAt(piece: DebrisPiece, t: number): DebrisPose {
  const { offset: o, velocity: v, spin } = piece;
  const rest = piece.size.y / 2;
  // it falls from o.y with v.y until its middle is `rest` above the ground: o.y + v.y·t − g t²/2 = rest
  const land = (v.y + Math.sqrt(v.y * v.y + 2 * GRAVITY * Math.max(0, o.y - rest))) / GRAVITY;
  if (t < land) {
    return {
      position: { x: o.x + v.x * t, y: o.y + v.y * t - (GRAVITY * t * t) / 2, z: o.z + v.z * t },
      rotation: { x: spin.x * t, y: spin.y * t, z: spin.z * t },
      resting: false,
    };
  }
  // on the ground: flat, sliding to a stop
  const s = Math.min(t - land, SLIDE);
  const along = land + s - (s * s) / (2 * SLIDE);
  return {
    position: { x: o.x + v.x * along, y: rest, z: o.z + v.z * along },
    rotation: { x: 0, y: spin.y * land, z: 0 },
    resting: t - land >= SLIDE,
  };
}
