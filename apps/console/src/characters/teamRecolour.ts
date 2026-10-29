/**
 * Team Up recolours the players (ff physics hq 2.mp4 9:48 onward: the sushi's black becomes dark red, the toast's crust and crumb
 * become deep and pale blue, the popsicle's mint becomes red): the BODY's colour goes to the team's hue, its own light and shade
 * stay, and what is not the body (a face, the sushi's leaf, a popsicle stick, a carrot's leaves) is left as it is. Pure: one pixel in,
 * one pixel out, so it is testable without a canvas; ThreePlaza paints each team's copy of an atlas once with it.
 */
export type Side = 0 | 1;

/** The team's hue (degrees): red leans a hair orange, blue is the video's cornflower. */
const TEAM_HUE: Readonly<Record<Side, number>> = { 0: 4, 1: 222 };
/** A little darker for red (the video's bodies are deep red), none for blue. */
const TEAM_VALUE: Readonly<Record<Side, number>> = { 0: 0.9, 1: 1 };
/** Hands (stub hands, drawn apart): the video's dark red and dark blue. */
export const TEAM_HANDS: Readonly<Record<Side, string>> = { 0: '#8a2a24', 1: '#3a56b8' };

/** Which pixels of a character are "the body": a band of hue (degrees; from > to wraps through 0) and what else must hold. */
interface Body {
  readonly from: number;
  readonly to: number;
  /** A white or grey body (a mug, a carton's white): any hue, but nearly colourless and not dark. */
  readonly grey?: boolean;
  /** Least saturation / value that counts (face features are dark and near-black: never the body). */
  readonly minS?: number;
  readonly minV?: number;
}

/** The characters that can be recoloured (the pack's: render/reconstructed/maps.ts `PackKind`). */
export type PackKind =
  | 'bread'
  | 'coffee'
  | 'watermelon'
  | 'icecream'
  | 'banana'
  | 'carrot'
  | 'avocado'
  | 'donut'
  | 'milk'
  | 'bacon';

const BODY: Readonly<Record<PackKind, readonly Body[]>> = {
  bread: [{ from: 20, to: 75, minS: 0.12, minV: 0.3 }],
  coffee: [{ from: 0, to: 360, grey: true, minV: 0.5 }],
  watermelon: [{ from: 340, to: 20, minS: 0.35, minV: 0.4 }],
  icecream: [{ from: 105, to: 205, minS: 0.15, minV: 0.3 }],
  banana: [{ from: 38, to: 70, minS: 0.35, minV: 0.4 }],
  carrot: [{ from: 0, to: 38, minS: 0.35, minV: 0.35 }],
  avocado: [{ from: 70, to: 150, minS: 0.25, minV: 0.3 }],
  donut: [{ from: 315, to: 350, minS: 0.25, minV: 0.4 }],
  milk: [{ from: 190, to: 235, minS: 0.35, minV: 0.3 }],
  bacon: [{ from: 0, to: 35, minS: 0.3, minV: 0.25 }],
};

const smooth = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** How much of `h` lies inside the band, 0..1: whole inside, fading over 12 degrees outside (an anti-aliased edge blends two hues). */
const inBand = (h: number, from: number, to: number): number => {
  const width = (to - from + 360) % 360 || 360;
  const centre = (from + width / 2) % 360;
  const away = Math.abs(((h - centre + 540) % 360) - 180);
  return 1 - smooth((away - width / 2) / 12);
};

/** How much of the pixel is the body (0..1). */
export const bodyWeight = (kind: PackKind, r: number, g: number, b: number): number => {
  const [h, s, v] = hsv(r, g, b);
  let w = 0;
  for (const band of BODY[kind]) {
    if (v < (band.minV ?? 0)) continue;
    if (band.grey === true) w = Math.max(w, 1 - smooth((s - 0.12) / 0.1));
    else if (s >= (band.minS ?? 0) * 0.7) {
      w = Math.max(w, inBand(h, band.from, band.to) * smooth(s / ((band.minS ?? 0.1) * 1.2)));
    }
  }
  return w;
};

const hsv = (r: number, g: number, b: number): [number, number, number] => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, max === 0 ? 0 : d / max, max / 255];
};

const rgb = (h: number, s: number, v: number): [number, number, number] => {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
};

/** One pixel of `kind` on `side`: its body to the team's hue, shade kept. Alpha is not touched here. */
export function teamPixel(
  kind: PackKind,
  side: Side,
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const w = bodyWeight(kind, r, g, b);
  if (w <= 0) return [r, g, b];
  const [, s, v] = hsv(r, g, b);
  // a pale body stays pale, a deep one deep; a colourless one (a white mug) takes enough colour to read as the team's
  const [tr, tg, tb] = rgb(TEAM_HUE[side], Math.max(s, 0.3), Math.min(1, v * TEAM_VALUE[side]));
  return [r + (tr - r) * w, g + (tg - g) * w, b + (tb - b) * w];
}

/** Recolours an RGBA buffer in place (an atlas's pixels), leaving alpha. */
export function recolourPixels(kind: PackKind, side: Side, data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] as number) < 8) continue;
    const [r, g, b] = teamPixel(
      kind,
      side,
      data[i] as number,
      data[i + 1] as number,
      data[i + 2] as number,
    );
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}
