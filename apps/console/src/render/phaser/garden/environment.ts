import * as Phaser from 'phaser';
import {
  GARDEN_HEIGHT,
  GARDEN_ROCKS,
  GARDEN_WALLS,
  GARDEN_WIDTH,
  type GardenRock,
  type GardenWall,
} from '@foomerang/foomerang-fu';
import {
  EXTERIOR_ROCKS,
  LEVERS,
  PLANTS,
  PORTALS,
  SAND,
  SHADE,
  TREES,
  TUFTS,
  type TreeArt,
} from '../../garden/gardenArt';
import {
  CAMERA_COLUMN,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  ROCK_HEIGHT,
  WALL_HEIGHT,
  project,
  type Point,
} from '../../garden/camera';
import type { Occluder } from '../../garden/occlusion';
import {
  grain,
  hex,
  hull,
  lighten,
  makeCanvas,
  mixColor,
  polyPath,
  rgb,
  rng,
  roundedPath,
  shade,
  softShadow,
  type Ctx,
  type P,
} from './paint';

/**
 * Garden's world, painted. Everything here is baked once into textures (soft shading, soft shadows, painterly ground) and
 * then drawn as ordinary sprites: the look of the reference video's environment — chunky bevelled volumes with a cool
 * rim, hand-painted matte materials, soft tonal patches, one warm key light from the upper left whose long soft shadows fall
 * to the lower right, a dark ambient-occlusion band wherever something meets the ground, mist and a vignette.
 *
 * The LAYOUT is the Garden image's (the rules' walls and boulders; measured props); this file is only how it is painted.
 */

/** The one key light: shadows are thrown toward +x, +y of the ground, as long as 0.95 × the object's height. */
export const LIGHT = { x: 0.95, y: 1.0 } as const;

const WALL_PAINT = {
  top: [0xaab2e6, 0x8e98d2, 0x7f89c6],
  south: [0x7a84bd, 0x5c66a3],
  side: [0x8790c9, 0x6a74b0],
  rim: 0xdfe4ff,
  seam: 0x6b75b1,
} as const;
const OLIVE_PAINT = {
  top: [0xd6bf6c, 0xbfa24d, 0xae9140],
  south: [0x99853f, 0x76662f],
  side: [0xa8934a, 0x867436],
  rim: 0xf0e0a0,
  seam: 0x8a7634,
} as const;
const ROCK_PAINT = {
  top: [0xb2bae9, 0x939dd6, 0x8892cc],
  body: [0x7f89c4, 0x626ca8, 0x4d5792],
  rim: 0xe2e7ff,
} as const;

type G = Phaser.GameObjects.Graphics;

/** An occluder that is also a sprite: it fades while it hides someone (Garden's one readability rule). */
export interface Solid extends Occluder {
  readonly image: Phaser.GameObjects.Image;
  alpha: number;
}

export interface Environment {
  readonly solids: Solid[];
  update(time: number): void;
}

function addTexture(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
}

const groundPoint = (x: number, y: number): P => project(x, y);

// ---------------------------------------------------------------------------------------------------------------------
// the ground
// ---------------------------------------------------------------------------------------------------------------------

function bakeGround(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const W = CANVAS_WIDTH;
  const H = CANVAS_HEIGHT;
  const r = rng(11);
  // far grass at the edges, brightening toward the middle of the arena (the reference's warm yellow-green light)
  const base = ctx.createRadialGradient(1000, 560, 80, 1000, 600, 1250);
  base.addColorStop(0, rgb(212, 238, 128));
  base.addColorStop(0.35, rgb(196, 227, 122));
  base.addColorStop(0.62, rgb(160, 205, 108));
  base.addColorStop(0.85, rgb(122, 170, 104));
  base.addColorStop(1, rgb(96, 142, 100));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  // a soft cool wash toward the top (distance haze) and warm toward the viewer
  const haze = ctx.createLinearGradient(0, 0, 0, H);
  haze.addColorStop(0, 'rgba(120,170,160,0.22)');
  haze.addColorStop(0.4, 'rgba(120,170,160,0)');
  haze.addColorStop(1, 'rgba(230,225,120,0.10)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, W, H);

  // large soft tonal patches: the hand-painted variation of the ground
  const blobs = (count: number, color: string, blur: number, rmin: number, rmax: number): void => {
    for (let i = 0; i < count; i += 1) {
      const cx = 200 + r() * (W - 400);
      const cy = 100 + r() * (H - 200);
      const rx = rmin + r() * (rmax - rmin);
      const ry = rx * (0.5 + r() * 0.4);
      softShadow(
        ctx,
        () => {
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, r() * Math.PI, 0, Math.PI * 2);
        },
        color,
        blur,
      );
    }
  };
  blobs(26, 'rgba(176,214,104,0.40)', 60, 70, 190);
  blobs(22, 'rgba(226,242,150,0.34)', 70, 80, 200);
  blobs(12, 'rgba(120,170,90,0.20)', 50, 60, 140);

  // shade under and beyond the trees: deeper, cooler green
  for (const s of SHADE) {
    softShadow(
      ctx,
      () => {
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
      },
      'rgba(70,118,92,0.62)',
      42,
    );
  }
  // pale dry patches
  for (const s of SAND) {
    softShadow(
      ctx,
      () => {
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
      },
      'rgba(244,238,168,0.92)',
      9,
    );
    softShadow(
      ctx,
      () => {
        ctx.beginPath();
        ctx.ellipse(
          s.x - s.rx * 0.1,
          s.y - s.ry * 0.12,
          s.rx * 0.6,
          s.ry * 0.55,
          0,
          0,
          Math.PI * 2,
        );
      },
      'rgba(252,248,200,0.55)',
      14,
    );
  }
  // the dashed arena boundary, lying on the ground in perspective
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(112,158,86,0.70)';
  ctx.lineWidth = 7;
  const corners = [
    groundPoint(0, 0),
    groundPoint(GARDEN_WIDTH, 0),
    groundPoint(GARDEN_WIDTH, GARDEN_HEIGHT),
    groundPoint(0, GARDEN_HEIGHT),
  ];
  for (let e = 0; e < 4; e += 1) {
    const a = corners[e] as P;
    const b = corners[(e + 1) % 4] as P;
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 37.5));
    for (let i = 0; i < n; i += 1) {
      ctx.beginPath();
      ctx.moveTo(a.x + (b.x - a.x) * (i / n), a.y + (b.y - a.y) * (i / n));
      ctx.lineTo(a.x + (b.x - a.x) * ((i + 0.6) / n), a.y + (b.y - a.y) * ((i + 0.6) / n));
      ctx.stroke();
    }
  }
  // grass tick marks
  ctx.strokeStyle = 'rgba(70,128,60,0.55)';
  ctx.lineWidth = 2.4;
  for (const t of TUFTS) {
    for (const dx of [-7, 0, 7]) {
      ctx.beginPath();
      ctx.moveTo(t.x + dx, t.y);
      ctx.lineTo(t.x + dx * 1.15, t.y - 7);
      ctx.stroke();
    }
  }
  // scattered little leaves and pebbles
  for (let i = 0; i < 70; i += 1) {
    const x = 220 + r() * (W - 440);
    const y = 110 + r() * (H - 220);
    ctx.fillStyle = r() > 0.5 ? 'rgba(236,160,70,0.45)' : 'rgba(255,255,215,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y, 2.5 + r() * 2, 1.5 + r() * 1.5, r() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  grain(ctx, W, H, 9000, 3, 0.045);
  return canvas;
}

/** The vignette and mist that sit over everything: the video's dim, soft, slightly desaturated frame edge. */
function bakeVignette(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const g = ctx.createRadialGradient(1000, 570, 380, 1000, 570, 1280);
  g.addColorStop(0, 'rgba(30,60,60,0)');
  g.addColorStop(0.6, 'rgba(30,60,60,0.10)');
  g.addColorStop(1, 'rgba(24,52,64,0.48)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const top = ctx.createLinearGradient(0, 0, 0, 220);
  top.addColorStop(0, 'rgba(70,110,120,0.20)');
  top.addColorStop(1, 'rgba(70,110,120,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, CANVAS_WIDTH, 220);
  return canvas;
}

// ---------------------------------------------------------------------------------------------------------------------
// shadows (one light, one rule: the hull of a footprint and the same footprint thrown along the light)
// ---------------------------------------------------------------------------------------------------------------------

function footprint(x: number, y: number, w: number, h: number, z = 0): P[] {
  return [project(x, y, z), project(x + w, y, z), project(x + w, y + h, z), project(x, y + h, z)];
}

function bakeShadows(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const castBox = (
    x: number,
    y: number,
    w: number,
    h: number,
    height: number,
    alpha: number,
    blur: number,
  ): void => {
    const near = footprint(x, y, w, h);
    const far = footprint(x + height * LIGHT.x, y + height * LIGHT.y, w, h);
    const outline = hull([...near, ...far]);
    // a long soft cast shadow …
    softShadow(ctx, () => polyPath(ctx, outline), `rgba(54,88,104,${alpha})`, blur);
  };
  for (const w of GARDEN_WALLS) {
    castBox(w.x, w.y, w.width, w.height, WALL_HEIGHT, 0.42, 16);
    // … and the dark ambient-occlusion band where the wall meets the floor
    softShadow(
      ctx,
      () => polyPath(ctx, footprint(w.x - 5, w.y - 3, w.width + 10, w.height + 12)),
      'rgba(40,66,86,0.55)',
      9,
    );
  }
  for (const r of GARDEN_ROCKS) {
    castBox(r.x, r.y, r.width, r.height, ROCK_HEIGHT, 0.5, 20);
    softShadow(
      ctx,
      () => polyPath(ctx, footprint(r.x - 6, r.y - 4, r.width + 12, r.height + 14)),
      'rgba(40,66,86,0.6)',
      11,
    );
  }
  // trees: a big soft pool of shade under each canopy, thrown to the lower right
  for (const t of TREES) {
    for (const c of t.canopy) {
      softShadow(
        ctx,
        () => {
          ctx.beginPath();
          ctx.ellipse(c.x + c.r * 0.8, c.y + c.r * 1.25, c.r * 1.2, c.r * 0.66, 0, 0, Math.PI * 2);
        },
        'rgba(48,96,92,0.5)',
        26,
      );
    }
  }
  // plants and levers: small contact shadows
  for (const p of PLANTS)
    softShadow(
      ctx,
      () => {
        ctx.beginPath();
        ctx.ellipse(p.x + 8, p.y + 4, 26 * p.s, 8 * p.s, 0, 0, Math.PI * 2);
      },
      'rgba(48,96,80,0.4)',
      7,
    );
  for (const l of LEVERS)
    softShadow(
      ctx,
      () => {
        ctx.beginPath();
        ctx.ellipse(l.base.x + 8, l.base.y + 5, 24, 8, 0, 0, Math.PI * 2);
      },
      'rgba(60,70,80,0.45)',
      6,
    );
  return canvas;
}

// ---------------------------------------------------------------------------------------------------------------------
// walls and boulders
// ---------------------------------------------------------------------------------------------------------------------

interface Baked {
  readonly canvas: HTMLCanvasElement;
  readonly x: number;
  readonly y: number;
}

const boundsOf = (
  pts: readonly P[],
  margin: number,
): { x0: number; y0: number; x1: number; y1: number } => ({
  x0: Math.floor(Math.min(...pts.map((p) => p.x)) - margin),
  y0: Math.floor(Math.min(...pts.map((p) => p.y)) - margin),
  x1: Math.ceil(Math.max(...pts.map((p) => p.x)) + margin),
  y1: Math.ceil(Math.max(...pts.map((p) => p.y)) + margin),
});

function gradient(ctx: Ctx, a: P, b: P, stops: readonly number[]): CanvasGradient {
  const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
  stops.forEach((c, i) => g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), hex(c)));
  return g;
}

/** One chunk of straight wall, painted as a chunky bevelled block with a lit rim. */
function bakeWallChunk(
  rect: { x: number; y: number; w: number; h: number },
  paint: typeof WALL_PAINT | typeof OLIVE_PAINT,
  horizontal: boolean,
  seed: number,
): Baked {
  const { x, y, w, h } = rect;
  const T = (px: number, py: number): P => project(px, py, WALL_HEIGHT);
  const B = (px: number, py: number): P => project(px, py, 0);
  const top = [T(x, y), T(x + w, y), T(x + w, y + h), T(x, y + h)];
  const south = [T(x, y + h), T(x + w, y + h), B(x + w, y + h), B(x, y + h)];
  const sideEast = [T(x + w, y), T(x + w, y + h), B(x + w, y + h), B(x + w, y)];
  const sideWest = [T(x, y), T(x, y + h), B(x, y + h), B(x, y)];
  const all = [...top, ...south, ...sideEast, ...sideWest];
  const b = boundsOf(all, 8);
  const { canvas, ctx } = makeCanvas(b.x1 - b.x0, b.y1 - b.y0);
  ctx.translate(-b.x0, -b.y0);
  const r = rng(seed);
  // south face: darker toward the ground (ambient occlusion), a thin lit lip under the bevel
  roundedPath(ctx, south, 0.18);
  ctx.fillStyle = gradient(ctx, south[0] as P, south[3] as P, paint.south);
  ctx.fill();
  const east = x + w <= CAMERA_COLUMN;
  const west = x >= CAMERA_COLUMN;
  if (east || west) {
    const face = east ? sideEast : sideWest;
    roundedPath(ctx, face, 0.18);
    ctx.fillStyle = gradient(ctx, face[0] as P, face[3] as P, paint.side);
    ctx.fill();
  }
  // top face: lit from the upper left
  roundedPath(ctx, top, 0.3);
  ctx.fillStyle = gradient(ctx, top[0] as P, top[2] as P, paint.top);
  ctx.fill();
  // seam lines and chips: hand-made stone
  ctx.save();
  roundedPath(ctx, top, 0.3);
  ctx.clip();
  ctx.strokeStyle = hex(paint.seam, 0.32);
  ctx.lineWidth = 2;
  const length = horizontal ? w : h;
  for (let s = 52 + r() * 30; s < length - 20; s += 70 + r() * 40) {
    const a = horizontal ? T(x + s, y) : T(x, y + s);
    const c = horizontal ? T(x + s, y + h) : T(x + w, y + s);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
  }
  ctx.fillStyle = hex(paint.seam, 0.18);
  for (let i = 0; i < 3; i += 1) {
    const p = T(x + r() * w, y + r() * h);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 3 + r() * 4, 2 + r() * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // cool rim light along the north and the lit west edge, a darker bevel line on the south edge
  ctx.lineCap = 'round';
  ctx.strokeStyle = hex(paint.rim, 0.85);
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo((top[3] as P).x + 3, (top[3] as P).y - 2);
  ctx.lineTo((top[0] as P).x + 3, (top[0] as P).y + 1);
  ctx.lineTo((top[1] as P).x - 3, (top[1] as P).y + 1);
  ctx.stroke();
  ctx.strokeStyle = hex(shade(paint.south[0], 0.8), 0.55);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo((top[3] as P).x + 3, (top[3] as P).y);
  ctx.lineTo((top[2] as P).x - 3, (top[2] as P).y);
  ctx.stroke();
  return { canvas, x: b.x0, y: b.y0 };
}

function bakeRock(
  rock: GardenRock,
  seed: number,
): Baked & { depth: number; box: { x0: number; y0: number; x1: number; y1: number } } {
  const r = rng(seed);
  const c = Math.min(26, rock.width / 3, rock.height / 3);
  const x0 = rock.x;
  const x1 = rock.x + rock.width;
  const y0 = rock.y;
  const y1 = rock.y + rock.height;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const TAPER = 0.88;
  const ring: [number, number][] = [
    [x0 + c, y0],
    [x1 - c, y0],
    [x1, y0 + c],
    [x1, y1 - c],
    [x1 - c, y1],
    [x0 + c, y1],
    [x0, y1 - c],
    [x0, y0 + c],
  ].map(
    (pt) =>
      [(pt[0] as number) + (r() - 0.5) * 14, (pt[1] as number) + (r() - 0.5) * 14] as [
        number,
        number,
      ],
  );
  const topRing = ring.map(([x, y]) =>
    project(mx + (x - mx) * TAPER, my + (y - my) * TAPER, ROCK_HEIGHT),
  );
  const baseRing = ring.map(([x, y]) => project(x, y, 0));
  const all = [...topRing, ...baseRing];
  const b = boundsOf(all, 14);
  const { canvas, ctx } = makeCanvas(b.x1 - b.x0, b.y1 - b.y0);
  ctx.translate(-b.x0, -b.y0);
  // the body: the hull of the top and the foot, shaded dark toward the ground
  const body = hull(all);
  roundedPath(ctx, body, 0.22);
  const topY = Math.min(...topRing.map((p) => p.y));
  const baseY = Math.max(...baseRing.map((p) => p.y));
  const bodyGradient = ctx.createLinearGradient(0, topY, 0, baseY);
  ROCK_PAINT.body.forEach((col, i) => bodyGradient.addColorStop(i / 2, hex(col)));
  ctx.fillStyle = bodyGradient;
  ctx.fill();
  // a lit left flank, a shaded right flank
  ctx.save();
  roundedPath(ctx, body, 0.22);
  ctx.clip();
  const flank = ctx.createLinearGradient(
    Math.min(...all.map((p) => p.x)),
    0,
    Math.max(...all.map((p) => p.x)),
    0,
  );
  flank.addColorStop(0, 'rgba(206,214,255,0.34)');
  flank.addColorStop(0.45, 'rgba(206,214,255,0)');
  flank.addColorStop(1, 'rgba(30,36,96,0.34)');
  ctx.fillStyle = flank;
  ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  // the dark foot (ambient occlusion on the stone itself) and a cool bounce light off the ground
  const foot = ctx.createLinearGradient(0, baseY - 40, 0, baseY);
  foot.addColorStop(0, 'rgba(40,46,110,0)');
  foot.addColorStop(1, 'rgba(40,46,110,0.38)');
  ctx.fillStyle = foot;
  ctx.fillRect(b.x0, baseY - 40, b.x1 - b.x0, 44);
  ctx.restore();
  // the top: a rounded, bevelled, lit lid
  roundedPath(ctx, topRing, 0.3);
  const lid = ctx.createLinearGradient(
    Math.min(...topRing.map((p) => p.x)),
    topY,
    Math.max(...topRing.map((p) => p.x)),
    Math.max(...topRing.map((p) => p.y)),
  );
  ROCK_PAINT.top.forEach((col, i) => lid.addColorStop(i / 2, hex(col)));
  ctx.fillStyle = lid;
  ctx.fill();
  // soft lumps on the lid
  ctx.save();
  roundedPath(ctx, topRing, 0.3);
  ctx.clip();
  for (let i = 0; i < 3; i += 1) {
    const p = topRing[Math.floor(r() * topRing.length)] as P;
    const cx = (p.x + (topRing[0] as P).x) / 2;
    const cy = (p.y + (topRing[3] as P).y) / 2;
    const g = ctx.createRadialGradient(cx - 8, cy - 8, 2, cx, cy, 40 + r() * 30);
    g.addColorStop(0, 'rgba(236,240,255,0.5)');
    g.addColorStop(1, 'rgba(236,240,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 80, cy - 80, 160, 160);
  }
  ctx.restore();
  // the cool rim along the lit upper edge
  ctx.strokeStyle = hex(ROCK_PAINT.rim, 0.8);
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  [7, 0, 1].forEach((i, k) => {
    const p = topRing[i] as P;
    if (k === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.strokeStyle = hex(shade(ROCK_PAINT.body[1], 0.7), 0.35);
  ctx.lineWidth = 2;
  roundedPath(ctx, topRing, 0.3);
  ctx.stroke();
  const depth = project(mx, y1).y;
  return { canvas, x: b.x0, y: b.y0, depth, box: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 } };
}

// ---------------------------------------------------------------------------------------------------------------------
// props
// ---------------------------------------------------------------------------------------------------------------------

function bakeCanopy(t: TreeArt, i: number): { canvas: HTMLCanvasElement; x: number; y: number } {
  const r = rng(200 + i);
  const pts = [...t.canopy, ...(t.foliage ?? [])];
  const b = {
    x0: Math.floor(Math.min(...pts.map((c) => c.x - c.r)) - 20),
    y0: Math.floor(Math.min(...pts.map((c) => c.y - c.r)) - 20),
    x1: Math.ceil(Math.max(...pts.map((c) => c.x + c.r)) + 20),
    y1: Math.ceil(Math.max(...pts.map((c) => c.y + c.r)) + 20),
  };
  const { canvas, ctx } = makeCanvas(b.x1 - b.x0, b.y1 - b.y0);
  ctx.translate(-b.x0, -b.y0);
  for (const f of t.foliage ?? []) {
    const g = ctx.createRadialGradient(f.x - f.r * 0.3, f.y - f.r * 0.3, f.r * 0.1, f.x, f.y, f.r);
    g.addColorStop(0, rgb(40, 110, 90));
    g.addColorStop(1, rgb(20, 70, 66));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const c of t.canopy) {
    // a clump of leaves: a rounded mass of overlapping lobes, lit from the upper left
    const lobes = 9;
    for (let l = 0; l < lobes; l += 1) {
      const a = (l / lobes) * Math.PI * 2 + r();
      const d = c.r * (0.45 + r() * 0.3);
      const lx = c.x + Math.cos(a) * d * 0.9;
      const ly = c.y + Math.sin(a) * d * 0.8;
      const lr = c.r * (0.42 + r() * 0.12);
      const g = ctx.createRadialGradient(lx - lr * 0.35, ly - lr * 0.4, lr * 0.1, lx, ly, lr);
      g.addColorStop(0, rgb(246, 196, 70));
      g.addColorStop(0.55, rgb(224, 160, 40));
      g.addColorStop(1, rgb(176, 112, 28));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lx, ly, lr, 0, Math.PI * 2);
      ctx.fill();
    }
    const top = ctx.createRadialGradient(
      c.x - c.r * 0.3,
      c.y - c.r * 0.35,
      c.r * 0.1,
      c.x,
      c.y,
      c.r,
    );
    top.addColorStop(0, rgb(252, 214, 96));
    top.addColorStop(0.7, rgb(236, 176, 52));
    top.addColorStop(1, rgb(190, 126, 34));
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r * 0.82, 0, Math.PI * 2);
    ctx.fill();
  }
  return { canvas, x: b.x0, y: b.y0 };
}

function bakeTrunk(t: TreeArt): { canvas: HTMLCanvasElement; x: number; y: number } | undefined {
  const { x, top, base, w } = t.trunk;
  if (w === 0) return undefined;
  const { canvas, ctx } = makeCanvas(w + 30, base - top + 24);
  const ox = x - w / 2 - 15;
  const oy = top - 6;
  ctx.translate(-ox, -oy);
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, rgb(212, 216, 246));
  g.addColorStop(0.55, rgb(176, 182, 226));
  g.addColorStop(1, rgb(112, 120, 184));
  ctx.fillStyle = g;
  ctx.fillRect(x - w / 2, top, w, base - top);
  ctx.beginPath();
  ctx.ellipse(x, base, w / 2, 7, 0, 0, Math.PI * 2);
  ctx.fillStyle = rgb(112, 120, 184);
  ctx.fill();
  ctx.fillStyle = rgb(92, 100, 168, 0.8);
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.ellipse(
      x + (i % 2 === 0 ? -6 : 7),
      top + 14 + i * ((base - top) / 4.4),
      5,
      7,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  return { canvas, x: ox, y: oy };
}

function bakePlant(s: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(90 * s, 70 * s);
  ctx.translate(45 * s, 64 * s);
  for (let i = -3; i <= 3; i += 1) {
    const a = -Math.PI / 2 + i * 0.42;
    const len = (46 - Math.abs(i) * 6) * s;
    const tx = Math.cos(a) * len;
    const ty = Math.sin(a) * len * 0.85;
    const g = ctx.createLinearGradient(0, 0, tx, ty);
    g.addColorStop(0, rgb(46, 120, 52));
    g.addColorStop(1, rgb(118, 188, 70));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-7 * s, 0);
    ctx.quadraticCurveTo(tx * 0.4 - 9 * s, ty * 0.5, tx, ty);
    ctx.quadraticCurveTo(tx * 0.4 + 9 * s, ty * 0.5, 7 * s, 0);
    ctx.fill();
  }
  return canvas;
}

function bakeLever(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(46, 52);
  const g = ctx.createLinearGradient(0, 8, 0, 44);
  g.addColorStop(0, rgb(240, 196, 172));
  g.addColorStop(1, rgb(190, 140, 118));
  ctx.fillStyle = g;
  roundedPath(
    ctx,
    [
      { x: 6, y: 10 },
      { x: 40, y: 10 },
      { x: 40, y: 40 },
      { x: 6, y: 40 },
    ],
    0.25,
  );
  ctx.fill();
  ctx.fillStyle = rgb(248, 214, 192);
  roundedPath(
    ctx,
    [
      { x: 6, y: 4 },
      { x: 40, y: 4 },
      { x: 40, y: 22 },
      { x: 6, y: 22 },
    ],
    0.3,
  );
  ctx.fill();
  ctx.fillStyle = rgb(150, 100, 84, 0.45);
  ctx.fillRect(10, 30, 26, 5);
  return canvas;
}

function glowTexture(size: number, inner: string, outer: string): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function bakeExteriorRock(
  rk: (typeof EXTERIOR_ROCKS)[number],
  i: number,
): Baked & { depth: number } {
  const rock: GardenRock = { id: `ext${i}`, x: 0, y: 0, width: 100, height: 100 };
  void rock;
  const w = rk.w;
  const h = rk.h + rk.lift + 20;
  const { canvas, ctx } = makeCanvas(w + 40, h + 40);
  ctx.translate(20 + w / 2, 20 + h - 12);
  const body = [
    { x: -w * 0.5, y: 0 },
    { x: -w * 0.55, y: -h * 0.55 },
    { x: -w * 0.3, y: -h * 0.92 },
    { x: w * 0.25, y: -h * 0.95 },
    { x: w * 0.55, y: -h * 0.55 },
    { x: w * 0.5, y: 0 },
  ];
  roundedPath(ctx, body, 0.28);
  const g = ctx.createLinearGradient(0, -h, 0, 0);
  g.addColorStop(0, hex(0x939dd6));
  g.addColorStop(0.35, hex(0x7480bd));
  g.addColorStop(1, hex(0x4d5792));
  ctx.fillStyle = g;
  ctx.fill();
  const lid = body.map((p) => ({ x: p.x * 0.86, y: p.y * 0.4 - h * 0.5 }));
  roundedPath(ctx, lid, 0.3);
  ctx.fillStyle = hex(0xa2abe0);
  ctx.fill();
  ctx.strokeStyle = hex(0xe2e7ff, 0.7);
  ctx.lineWidth = 3;
  ctx.stroke();
  return { canvas, x: rk.x - w / 2 - 20, y: rk.y - h - 8, depth: rk.y };
}

// ---------------------------------------------------------------------------------------------------------------------
// the whole world
// ---------------------------------------------------------------------------------------------------------------------

export function buildEnvironment(scene: Phaser.Scene): Environment {
  const layer = (
    key: string,
    canvas: HTMLCanvasElement,
    depth: number,
  ): Phaser.GameObjects.Image => {
    addTexture(scene, key, canvas);
    return scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(depth);
  };
  layer('garden-ground', bakeGround(), -100);
  layer('garden-shadows', bakeShadows(), -90);

  // exterior boulders and the trees that frame the arena
  EXTERIOR_ROCKS.forEach((rk, i) => {
    const baked = bakeExteriorRock(rk, i);
    addTexture(scene, `garden-xrock-${i}`, baked.canvas);
    scene.add.image(baked.x, baked.y, `garden-xrock-${i}`).setOrigin(0, 0).setDepth(-80);
  });
  const sway: { image: Phaser.GameObjects.Image; phase: number; amount: number; base: Point }[] =
    [];
  TREES.forEach((t, i) => {
    const trunk = bakeTrunk(t);
    if (trunk !== undefined) {
      addTexture(scene, `garden-trunk-${i}`, trunk.canvas);
      scene.add.image(trunk.x, trunk.y, `garden-trunk-${i}`).setOrigin(0, 0).setDepth(-70);
    }
    const canopy = bakeCanopy(t, i);
    addTexture(scene, `garden-canopy-${i}`, canopy.canvas);
    const pivotX = t.trunk.x - canopy.x;
    const pivotY = t.trunk.base - canopy.y;
    const image = scene.add
      .image(canopy.x + pivotX, canopy.y + pivotY, `garden-canopy-${i}`)
      .setOrigin(pivotX / canopy.canvas.width, pivotY / canopy.canvas.height)
      .setDepth(-60);
    sway.push({ image, phase: i * 1.7, amount: 0.012, base: { x: image.x, y: image.y } });
  });

  // interior props: plants (swaying), levers
  PLANTS.forEach((p, i) => {
    addTexture(scene, `garden-plant-${i}`, bakePlant(p.s));
    const image = scene.add
      .image(p.x, p.y, `garden-plant-${i}`)
      .setOrigin(0.5, 0.9)
      .setDepth(p.y - 1);
    sway.push({ image, phase: i * 2.3, amount: 0.035, base: { x: p.x, y: p.y } });
  });
  addTexture(scene, 'garden-lever', bakeLever());
  addTexture(
    scene,
    'garden-glow-cyan',
    glowTexture(64, 'rgba(120,230,255,0.95)', 'rgba(60,200,255,0)'),
  );
  const orbs: Phaser.GameObjects.Image[] = [];
  for (const l of LEVERS) {
    const g = scene.add.graphics().setDepth(l.base.y + 0.5);
    g.lineStyle(5, 0xd8ae95, 1);
    g.lineBetween(l.base.x - 2, l.base.y - 14, l.orb.x, l.orb.y);
    g.fillStyle(0xfff6ee, 0.0);
    scene.add
      .image(l.base.x, l.base.y - 18, 'garden-lever')
      .setOrigin(0.5, 0.62)
      .setDepth(l.base.y + 1);
    orbs.push(
      scene.add
        .image(l.orb.x, l.orb.y, 'garden-glow-cyan')
        .setDepth(l.base.y + 2)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.7),
    );
    scene.add.circle(l.orb.x, l.orb.y, 7, 0x5cd9f5).setDepth(l.base.y + 2.5);
    scene.add.circle(l.orb.x - 2, l.orb.y - 2.5, 2.5, 0xffffff, 0.85).setDepth(l.base.y + 2.6);
  }

  // portals
  const portal = scene.add.graphics().setDepth(0);
  const portalGlow: Phaser.GameObjects.Image[] = PORTALS.map((p) =>
    scene.add
      .image(p.x, p.y, 'garden-glow-cyan')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale((p.ry / 32) * 1.4, (p.ry / 32) * 1.8)
      .setAlpha(0.55),
  );

  // walls and boulders: the solids that can fade
  const solids: Solid[] = [];
  const addSolid = (key: string, baked: Baked, depth: number, box: Occluder['box']): void => {
    addTexture(scene, key, baked.canvas);
    const image = scene.add.image(baked.x, baked.y, key).setOrigin(0, 0).setDepth(depth);
    solids.push({ image, depth, box, alpha: 1 });
  };
  GARDEN_WALLS.forEach((wall, wi) => {
    const horizontal = wall.width >= wall.height;
    const length = horizontal ? wall.width : wall.height;
    const n = Math.max(1, Math.ceil(length / 110));
    for (let i = 0; i < n; i += 1) {
      const from = (length * i) / n;
      const to = (length * (i + 1)) / n;
      const rect = {
        x: horizontal ? wall.x + from : wall.x,
        y: horizontal ? wall.y : wall.y + from,
        w: horizontal ? to - from : wall.width,
        h: horizontal ? wall.height : to - from,
      };
      const baked = bakeWallChunk(
        rect,
        wall.kind === 'OLIVE' ? OLIVE_PAINT : WALL_PAINT,
        horizontal,
        wi * 97 + i,
      );
      const depth = project(rect.x + rect.w / 2, rect.y + rect.h).y;
      addSolid(`garden-wall-${wi}-${i}`, baked, depth, {
        x0: baked.x,
        y0: baked.y,
        x1: baked.x + baked.canvas.width,
        y1: baked.y + baked.canvas.height,
      });
    }
  });
  GARDEN_ROCKS.forEach((rock, ri) => {
    const baked = bakeRock(rock, 500 + ri);
    addSolid(`garden-rock-${ri}`, baked, baked.depth, baked.box);
  });
  // the portals sit on a rock face: above that rock, below anyone in front of it
  const portalDepth = Math.max(...solids.slice(-GARDEN_ROCKS.length).map((s) => s.depth)) + 0.1;
  portal.setDepth(portalDepth);
  for (const g of portalGlow) g.setDepth(portalDepth);
  const vignette = layer('garden-vignette', bakeVignette(), 8000);
  vignette.setAlpha(1);

  return {
    solids,
    update: (time) => {
      for (const s of sway) {
        s.image.setRotation(Math.sin(time / 1300 + s.phase) * s.amount);
      }
      orbs.forEach((o, i) => o.setAlpha(0.65 + 0.25 * Math.sin(time / 380 + i)));
      drawPortals(portal, time);
      portalGlow.forEach((g, i) => g.setAlpha(0.45 + 0.15 * Math.sin(time / 300 + i * 2)));
    },
  };
}

const PORTAL_DEEP = 0x187fb9;
const PORTAL_GLOW = 0x6fd0ff;

function drawPortals(g: G, time: number): void {
  g.clear();
  for (const p of PORTALS) {
    g.fillStyle(0x3b4690, 1);
    g.fillEllipse(p.x + 9, p.y, p.rx * 3.4, p.ry * 2.5);
    g.fillStyle(0x2a3270, 1);
    g.fillEllipse(p.x + 5, p.y, p.rx * 2.8, p.ry * 2.2);
    g.fillStyle(PORTAL_DEEP, 0.95);
    g.fillEllipse(p.x, p.y, p.rx * 2, p.ry * 2);
    for (let arm = 0; arm < 3; arm += 1) {
      g.lineStyle(4 - arm * 0.7, arm === 0 ? 0xffffff : PORTAL_GLOW, 0.92 - arm * 0.2);
      g.beginPath();
      const spin = time / 380 + arm * 2.1;
      for (let i = 0; i <= 24; i += 1) {
        const t = i / 24;
        const a = spin + t * 4.2;
        const rr = 1 - t * 0.85;
        const x = p.x + Math.cos(a) * p.rx * rr * 0.95;
        const y = p.y + Math.sin(a) * p.ry * rr * 0.95;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokePath();
    }
    g.lineStyle(3, PORTAL_GLOW, 0.9);
    g.strokeEllipse(p.x, p.y, p.rx * 2.1, p.ry * 2.1);
  }
}

/** The lit lighting constant other layers share, re-exported for the characters' shadows. */
export { lighten, mixColor, project as projectGround };
export type { GardenWall };
