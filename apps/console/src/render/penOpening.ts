/**
 * The warm-up's pens opening (the HQ, foomerang-fu physics hq.mp4: the mug's pen 2.53-2.87 s, the aubergine's 3.70-4.00 s, 60 fps;
 * owner, 2026-11-12: "it settles into the ground"): the lever struck, the whole pen takes the striker's colour at once (the wall's
 * lavender times a light version of it), fading back about half way while it stands; at 0.17 s the pen's two end walls sink straight
 * down into the ground (gone by 0.21 s), the two long walls, the ones over the moat, a moment after (gone by 0.29 s). Pure: what a
 * wall shows `t` seconds after its lever was struck (undefined: not yet).
 */
export const PEN_OPEN_SECONDS = 0.29;

export interface PenWallPose {
  /** How far the wall has taken the striker's colour (0 its own lavender, 1 the colour: penTintFactor). */
  readonly tint: number;
  /** How far it has sunk into the ground (0 standing, 1 its top level with the ground). */
  readonly sink: number;
  readonly visible: boolean;
}

const smooth = (t: number, from: number, to: number): number => {
  const u = Math.min(1, Math.max(0, (t - from) / (to - from)));
  return u * u * (3 - 2 * u);
};

/** `end`: one of the pen's two short end walls (they go first), else one of its long walls. */
export function penWallAt(t: number | undefined, end: boolean): PenWallPose {
  if (t === undefined || t < 0) return { tint: 0, sink: 0, visible: true };
  const [from, to] = end ? [0.17, 0.21] : [0.18, PEN_OPEN_SECONDS];
  // (the aubergine's walls: 1 to 0.01 s, 0.78 at 0.08 s, 0.48 at 0.18 s of the way from its lavender to the struck colour)
  const tint = Math.max(0.45, 1 - 2.9 * Math.max(0, t - 0.01));
  if (t >= to) return { tint, sink: 1, visible: false };
  return { tint, sink: smooth(t, from, to), visible: true };
}

/**
 * What the wall's own colour is multiplied by at full tint (sRGB, 0-1): a light version of the player's colour (the HQ's player
 * colours are pastels: a slot colour a third of the way to white), a little darker (the mug's white pen went x0.88).
 */
export function penTintFactor(colour: string): readonly [number, number, number] {
  const n = Number.parseInt(colour.replace('#', ''), 16);
  const channel = (shift: number): number => {
    const c = ((n >> shift) & 0xff) / 255;
    return (c + (1 - c) * 0.35) * 0.89;
  };
  return [channel(16), channel(8), channel(0)];
}

/** The lever's burst: chips of the struck colour (the aubergine's pen, 3.717-3.95 s, 30 fps, ~29 px a unit). */
export const PEN_CHIPS = 8;
const CHIPS_GONE = 0.25;

export interface PenChip {
  /** Off the knob along the ground, plan units (y north). */
  readonly x: number;
  readonly y: number;
  /** Height above the ground, plan units (the knob is 1.4 up). */
  readonly z: number;
  /** Its length and thickness, plan units (dashes ~12 x 4 px). */
  readonly length: number;
  readonly width: number;
  readonly visible: boolean;
}

/** Chip `k` (0..PEN_CHIPS-1) `t` seconds after the strike: out fast then slow (~0.6 unit at 0.04 s, ~1.8 by 0.15 s), falling. */
export function penChipAt(t: number, k: number): PenChip {
  const turn = ((k + 0.5) / PEN_CHIPS) * 2 * Math.PI + 0.35 * Math.sin(k * 12.9898);
  const reach = 1.75 + 0.35 * Math.sin(k * 78.233);
  const r = 0.25 + reach * (1 - Math.exp(-t / 0.06));
  const fall = Math.min(1, t / 0.2);
  const shrink = Math.min(1, Math.max(0, (CHIPS_GONE - t) / 0.05));
  return {
    x: Math.cos(turn) * r,
    y: Math.sin(turn) * r,
    z: 1.4 * (1 - fall * fall),
    length: (0.38 + 0.12 * Math.cos(k * 3.7)) * shrink,
    width: 0.14 * shrink,
    visible: t >= 0 && t < CHIPS_GONE,
  };
}

/** The short radial streaks round the knob: the strike's first frame or so. */
export const penStreaksAt = (t: number | undefined): boolean =>
  t !== undefined && t >= 0 && t < 0.035;
