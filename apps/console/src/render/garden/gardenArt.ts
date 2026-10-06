/**
 * Garden's PRESENTATION data: where the decoration of "Garden Map - Fu" stands, as canvas pixels in the canonical 1999 × 1138
 * frame (the camera is fixed, so a placement is a placement). Measured from the reference's composition; none of it is
 * gameplay. The walls, rocks, spawns and Books are NOT here: those are the rules' data (GARDEN_* in the Fu package) and the
 * renderer only draws them. Colours are the reference's palette.
 */

export interface Blob {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
}

export const PALETTE = {
  grassFar: 0x78a96c,
  grassNear: 0xc4e37b,
  grassDark: 0x7ba96b,
  shade: 0x6f9a5f,
  dash: 0x93b861,
  sand: 0xeeea9f,
  wallTop: 0x8f99cf,
  wallTopEdge: 0xaab3e3,
  wallSouth: 0x6e77b1,
  wallSide: 0x7d86bf,
  wallSeam: 0x7a83bb,
  oliveTop: 0x8b8850,
  oliveSouth: 0x66633a,
  oliveSide: 0x77743f,
  rockTop: 0x8f99cf,
  rockHighlight: 0xa3acdb,
  rockSide: 0x5a6aa8,
  rockDeep: 0x46558f,
  canopy: 0xd9a22b,
  canopyLight: 0xe7b53c,
  canopyDark: 0xb98320,
  foliageDeep: 0x18493f,
  birch: 0xb5b9e4,
  birchDark: 0x6a70ad,
  leaf: 0x57a846,
  leafDark: 0x3f8a3b,
  portalDeep: 0x187fb9,
  portalGlow: 0x6fd0ff,
  leverBase: 0xd8ae95,
  leverOrb: 0x5cd9f5,
} as const;

/** Pale patches of dry ground. */
export const SAND: readonly Blob[] = [
  { x: 402, y: 175, rx: 36, ry: 26 },
  { x: 530, y: 586, rx: 64, ry: 50 },
  { x: 332, y: 906, rx: 56, ry: 20 },
  { x: 1336, y: 684, rx: 72, ry: 16 },
  { x: 918, y: 626, rx: 52, ry: 28 },
];

/** Darker ground under the trees and out past the boundary: soft blobs of the far grass colour. */
export const SHADE: readonly Blob[] = [
  { x: 150, y: 330, rx: 105, ry: 100 },
  { x: 90, y: 150, rx: 140, ry: 170 },
  { x: 1815, y: 395, rx: 110, ry: 80 },
  { x: 1860, y: 150, rx: 140, ry: 180 },
  { x: 90, y: 1090, rx: 150, ry: 90 },
  { x: 1950, y: 1070, rx: 90, ry: 90 },
  { x: 1580, y: 40, rx: 90, ry: 60 },
];

/** Leafy ground plants (a fan of leaves), by the ground point they grow from, and a size. */
export const PLANTS: readonly { readonly x: number; readonly y: number; readonly s: number }[] = [
  { x: 566, y: 292, s: 1 },
  { x: 1535, y: 560, s: 0.9 },
  { x: 308, y: 782, s: 0.95 },
  { x: 762, y: 988, s: 1.1 },
  { x: 1388, y: 1010, s: 1.1 },
];

/** Little grass tufts: three short strokes. */
export const TUFTS: readonly { readonly x: number; readonly y: number }[] = [
  { x: 350, y: 574 },
  { x: 556, y: 349 },
  { x: 1058, y: 153 },
  { x: 1300, y: 263 },
  { x: 1182, y: 742 },
  { x: 1354, y: 861 },
  { x: 870, y: 842 },
  { x: 1540, y: 700 },
];

export interface TreeArt {
  readonly trunk: {
    readonly x: number;
    readonly top: number;
    readonly base: number;
    readonly w: number;
  };
  readonly canopy: readonly { readonly x: number; readonly y: number; readonly r: number }[];
  readonly foliage?: readonly { readonly x: number; readonly y: number; readonly r: number }[];
}

/** The autumn trees that frame the arena from outside the boundary. */
export const TREES: readonly TreeArt[] = [
  {
    trunk: { x: 98, top: 175, base: 262, w: 40 },
    canopy: [
      { x: 126, y: 146, r: 46 },
      { x: 20, y: 164, r: 42 },
      { x: 44, y: 26, r: 42 },
      { x: 82, y: 22, r: 36 },
    ],
    foliage: [
      { x: 120, y: 60, r: 64 },
      { x: 60, y: 90, r: 50 },
    ],
  },
  {
    trunk: { x: 1796, top: 232, base: 300, w: 34 },
    canopy: [
      { x: 1880, y: 96, r: 46 },
      { x: 1828, y: 126, r: 40 },
      { x: 1858, y: 202, r: 46 },
      { x: 1792, y: 218, r: 40 },
    ],
  },
  {
    trunk: { x: 98, top: 1070, base: 1128, w: 36 },
    canopy: [
      { x: 52, y: 990, r: 52 },
      { x: 104, y: 1038, r: 46 },
      { x: 28, y: 1082, r: 40 },
      { x: 142, y: 1056, r: 34 },
    ],
    foliage: [{ x: 56, y: 1126, r: 70 }],
  },
  {
    trunk: { x: 1990, top: 1070, base: 1138, w: 0 },
    canopy: [],
    foliage: [
      { x: 1976, y: 1112, r: 62 },
      { x: 1935, y: 1135, r: 40 },
    ],
  },
  { trunk: { x: 1548, top: 0, base: 30, w: 26 }, canopy: [], foliage: [{ x: 1546, y: 6, r: 22 }] },
];

/** Big boulders OUTSIDE the boundary: decoration only (nothing collides with them). x, y: centre of the base; w, h: size. */
export const EXTERIOR_ROCKS: readonly {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly lift: number;
}[] = [
  { x: 1878, y: 790, w: 92, h: 100, lift: 38 },
  { x: 1782, y: 88, w: 100, h: 56, lift: 28 },
];

/** The swirling blue portals set into the big rocks (visual only in Slice 9; see docs/GARDEN.md). */
export const PORTALS: readonly {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
  readonly tilt: number;
}[] = [
  { x: 441, y: 700, rx: 21, ry: 64, tilt: -0.06 },
  { x: 1526, y: 412, rx: 20, ry: 62, tilt: 0.08 },
];

/** Lever structures: the base block's ground point, and the blue orb at the end of the handle (decoration in Slice 9). */
export const LEVERS: readonly {
  readonly base: { readonly x: number; readonly y: number };
  readonly orb: { readonly x: number; readonly y: number };
}[] = [
  { base: { x: 1243, y: 190 }, orb: { x: 1203, y: 174 } },
  { base: { x: 908, y: 428 }, orb: { x: 866, y: 420 } },
  { base: { x: 667, y: 652 }, orb: { x: 660, y: 681 } },
  { base: { x: 1006, y: 776 }, orb: { x: 972, y: 784 } },
];
