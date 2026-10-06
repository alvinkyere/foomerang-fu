/**
 * A small painter's toolkit on Canvas 2D. Garden's look (soft shading, soft shadows, painterly ground, plush characters) is
 * BAKED into textures with it once, when the scene starts; at run time Phaser only places and animates the baked sprites. It
 * uses nothing but the browser's own canvas: no new dependency, and no asset is downloaded (every texture is generated).
 */

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w));
  canvas.height = Math.max(1, Math.ceil(h));
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('canvas 2d is not available');
  return { canvas, ctx };
}

/** A small deterministic generator (mulberry32): the painting is the same every time. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rgb = (r: number, g: number, b: number, a = 1): string =>
  `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;

export const hex = (c: number, a = 1): string => rgb((c >> 16) & 255, (c >> 8) & 255, c & 255, a);

export function shade(c: number, k: number): number {
  const ch = (shift: number) => Math.max(0, Math.min(255, Math.round(((c >> shift) & 255) * k)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function lighten(c: number, t: number): number {
  const ch = (shift: number) => Math.round(((c >> shift) & 255) * (1 - t) + 255 * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function mixColor(a: number, b: number, t: number): number {
  const ch = (shift: number) =>
    Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export interface P {
  readonly x: number;
  readonly y: number;
}

/** A closed path through `pts`, rounded: quadratic curves between edge midpoints, so corners soften without vanishing. */
export function roundedPath(ctx: Ctx, pts: readonly P[], roundness = 0.5): void {
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i += 1) {
    const prev = pts[(i + n - 1) % n] as P;
    const cur = pts[i] as P;
    const next = pts[(i + 1) % n] as P;
    const a = { x: cur.x + (prev.x - cur.x) * roundness, y: cur.y + (prev.y - cur.y) * roundness };
    const b = { x: cur.x + (next.x - cur.x) * roundness, y: cur.y + (next.y - cur.y) * roundness };
    if (i === 0) ctx.moveTo(a.x, a.y);
    else ctx.lineTo(a.x, a.y);
    ctx.quadraticCurveTo(cur.x, cur.y, b.x, b.y);
  }
  ctx.closePath();
}

export function polyPath(ctx: Ctx, pts: readonly P[]): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

/**
 * Draws ONLY the soft shadow of a shape: the shape is drawn far off the canvas and its shadow is thrown back onto it, so the
 * hard shape never shows. This is how every shadow in Garden gets its soft edge (portable: no `filter` needed).
 */
export function softShadow(
  ctx: Ctx,
  path: () => void,
  color: string,
  blur: number,
  passes = 1,
): void {
  const FAR = 20000;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = FAR;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#000';
  ctx.translate(-FAR, 0);
  for (let i = 0; i < passes; i += 1) {
    path();
    ctx.fill();
  }
  ctx.restore();
}

/** Convex hull (gift wrapping) of a few points: a shadow is the hull of a footprint and the same footprint thrown along the light. */
export function hull(points: readonly P[]): P[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: P, a: P, b: P): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: P[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2] as P, lower[lower.length - 1] as P, p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  const upper: P[] = [];
  for (const p of [...pts].reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2] as P, upper[upper.length - 1] as P, p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Fine film grain: the painted, hand-made feel of the reference (never visible as a pattern). */
export function grain(
  ctx: Ctx,
  w: number,
  h: number,
  count: number,
  seed: number,
  alpha = 0.05,
): void {
  const r = rng(seed);
  for (let i = 0; i < count; i += 1) {
    const light = r() > 0.5;
    ctx.fillStyle = light ? `rgba(255,255,230,${alpha})` : `rgba(40,60,30,${alpha})`;
    ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}
