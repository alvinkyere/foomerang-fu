import type * as Phaser from 'phaser';
import {
  GARDEN_HEIGHT,
  GARDEN_WIDTH,
  type GardenRock,
  type GardenWall,
} from '@foomerang/foomerang-fu';
import {
  EXTERIOR_ROCKS,
  LEVERS,
  PALETTE,
  PLANTS,
  PORTALS,
  SAND,
  SHADE,
  TREES,
  TUFTS,
  type Blob,
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

type G = Phaser.GameObjects.Graphics;

/** Fills a polygon given as canvas points. */
const poly = (g: G, pts: readonly Point[], color: number, alpha = 1): void => {
  g.fillStyle(color, alpha);
  g.fillPoints(pts as never, true);
};
const mixPoint = (a: Point, b: Point): Point => ({
  x: a.x + (b.x - a.x) * 0.35,
  y: a.y + (b.y - a.y) * 0.35,
});
const blob = (g: G, b: Blob, color: number, alpha = 1): void => {
  g.fillStyle(color, alpha);
  g.fillEllipse(b.x, b.y, b.rx * 2, b.ry * 2);
};
const mix = (a: number, b: number, t: number): number => {
  const ch = (shift: number) =>
    Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** The floor: far grass at the edges, brightening to the middle, with the pale patches, shade and the dashed boundary. */
export function drawGround(g: G): void {
  g.fillStyle(PALETTE.grassFar, 1);
  g.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  // a soft radial brightening toward the middle of the arena, in a few steps
  const steps = 70;
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    g.fillStyle(mix(PALETTE.grassFar, PALETTE.grassNear, Math.min(1, Math.sqrt(t) * 1.25)), 1);
    const k = 1 - t * 0.5;
    g.fillEllipse(1000, 585, 2320 * k, 1420 * k);
  }
  for (const s of SHADE) blob(g, s, PALETTE.grassDark, 0.55);
  for (const s of SAND) blob(g, s, PALETTE.sand, 0.85);
  // the dashed arena boundary, drawn ON the ground so it follows the perspective
  g.lineStyle(7, PALETTE.dash, 0.9);
  const edge = (a: Point, b: Point): void => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(length / 37.5));
    for (let i = 0; i < n; i += 1) {
      const t0 = i / n;
      const t1 = t0 + 0.6 / n;
      g.lineBetween(
        a.x + (b.x - a.x) * t0,
        a.y + (b.y - a.y) * t0,
        a.x + (b.x - a.x) * t1,
        a.y + (b.y - a.y) * t1,
      );
    }
  };
  const tl = project(0, 0);
  const tr = project(GARDEN_WIDTH, 0);
  const bl = project(0, GARDEN_HEIGHT);
  const br = project(GARDEN_WIDTH, GARDEN_HEIGHT);
  edge(tl, tr);
  edge(tr, br);
  edge(br, bl);
  edge(bl, tl);
  g.lineStyle(3, PALETTE.leafDark, 0.55);
  for (const t of TUFTS) {
    for (const dx of [-7, 0, 7]) g.lineBetween(t.x + dx, t.y, t.x + dx * 1.1, t.y - 7);
  }
}

/** Soft shadows the walls and rocks throw on the ground (light from the upper left). */
export function drawShadows(
  g: G,
  walls: readonly GardenWall[],
  rocks: readonly GardenRock[],
): void {
  const dx = 26;
  const dy = 20;
  const cast = (x: number, y: number, w: number, h: number, alpha: number): void => {
    poly(
      g,
      [
        project(x, y),
        project(x + dx, y + dy),
        project(x + w + dx, y + dy),
        project(x + w + dx, y + h + dy),
        project(x + w, y + h + dy),
        project(x, y + h),
      ],
      PALETTE.shade,
      alpha,
    );
  };
  for (const w of walls) cast(w.x, w.y, w.width, w.height, 0.34);
  for (const r of rocks) cast(r.x, r.y, r.width, r.height, 0.4);
}

export interface ScreenBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** A wall chunk: its draw depth, its footprint on screen, and how to draw it (into its own Graphics, so it can fade). */
export interface Chunk {
  readonly depth: number;
  readonly box: ScreenBox;
  readonly draw: (g: G) => void;
}

const boundsOf = (pts: readonly Point[]): ScreenBox => ({
  x0: Math.min(...pts.map((p) => p.x)),
  y0: Math.min(...pts.map((p) => p.y)),
  x1: Math.max(...pts.map((p) => p.x)),
  y1: Math.max(...pts.map((p) => p.y)),
});

interface BoxColors {
  readonly top: number;
  readonly south: number;
  readonly side: number;
  readonly edge: number;
  readonly seam: number;
}

/** A solid box seen from the camera: its south face, the side face toward the camera's column, and the lit top. */
function drawBox(
  g: G,
  r: { x: number; y: number; w: number; h: number },
  hz: number,
  colors: BoxColors,
  horizontal: boolean,
  roundStart: boolean,
  roundEnd: boolean,
  seam: number | undefined,
): void {
  const { x, y, w, h } = r;
  const P = (px: number, py: number, z: number): Point => project(px, py, z);
  poly(g, [P(x, y + h, hz), P(x + w, y + h, hz), P(x + w, y + h, 0), P(x, y + h, 0)], colors.south);
  if (x + w <= CAMERA_COLUMN)
    poly(
      g,
      [P(x + w, y, hz), P(x + w, y + h, hz), P(x + w, y + h, 0), P(x + w, y, 0)],
      colors.side,
    );
  else if (x >= CAMERA_COLUMN)
    poly(g, [P(x, y, hz), P(x, y + h, hz), P(x, y + h, 0), P(x, y, 0)], colors.side);
  // the lit top, its ends rounded where the wall really ends
  const c = 7;
  const a = roundStart ? c : 0;
  const b = roundEnd ? c : 0;
  const top: Point[] = horizontal
    ? [
        P(x + a, y, hz),
        P(x + w - b, y, hz),
        P(x + w, y + c * 0.6, hz),
        P(x + w, y + h - c * 0.6, hz),
        P(x + w - b, y + h, hz),
        P(x + a, y + h, hz),
        P(x, y + h - c * 0.6, hz),
        P(x, y + c * 0.6, hz),
      ]
    : [
        P(x + c * 0.6, y, hz),
        P(x + w - c * 0.6, y, hz),
        P(x + w, y + a, hz),
        P(x + w, y + h - b, hz),
        P(x + w - c * 0.6, y + h, hz),
        P(x + c * 0.6, y + h, hz),
        P(x, y + h - b, hz),
        P(x, y + a, hz),
      ];
  poly(g, top, colors.top);
  const e0 = P(x + 6, y + 1.5, hz);
  const e1 = P(x + w - 6, y + 1.5, hz);
  g.lineStyle(3, colors.edge, 0.8);
  g.lineBetween(e0.x, e0.y, e1.x, e1.y);
  if (seam !== undefined) {
    const s0 = horizontal ? P(x + seam, y + 2, hz) : P(x + 2, y + seam, hz);
    const s1 = horizontal ? P(x + seam, y + h - 2, hz) : P(x + w - 2, y + seam, hz);
    g.lineStyle(2, colors.seam, 0.6);
    g.lineBetween(s0.x, s0.y, s1.x, s1.y);
  }
}

const STONE: BoxColors = {
  top: PALETTE.wallTop,
  south: PALETTE.wallSouth,
  side: PALETTE.wallSide,
  edge: PALETTE.wallTopEdge,
  seam: PALETTE.wallSeam,
};
const OLIVE: BoxColors = {
  top: PALETTE.oliveTop,
  south: PALETTE.oliveSouth,
  side: PALETTE.oliveSide,
  edge: 0xa5a265,
  seam: PALETTE.oliveSouth,
};

/** A straight wall, cut into chunks along its length so it can be drawn in the right depth order among the people. */
export function wallChunks(wall: GardenWall): Chunk[] {
  const horizontal = wall.width >= wall.height;
  const length = horizontal ? wall.width : wall.height;
  const n = Math.max(1, Math.ceil(length / 110));
  const colors = wall.kind === 'OLIVE' ? OLIVE : STONE;
  const chunks: Chunk[] = [];
  for (let i = 0; i < n; i += 1) {
    const from = (length * i) / n;
    const to = (length * (i + 1)) / n;
    const rect = {
      x: horizontal ? wall.x + from : wall.x,
      y: horizontal ? wall.y : wall.y + from,
      w: horizontal ? to - from : wall.width,
      h: horizontal ? wall.height : to - from,
    };
    const corners = [
      project(rect.x, rect.y, WALL_HEIGHT),
      project(rect.x + rect.w, rect.y, WALL_HEIGHT),
      project(rect.x, rect.y + rect.h, 0),
      project(rect.x + rect.w, rect.y + rect.h, 0),
    ];
    const seam = wall.kind === 'STONE' ? (to - from) * 0.55 : undefined;
    chunks.push({
      depth: project(rect.x + rect.w / 2, rect.y + rect.h).y,
      box: boundsOf(corners),
      draw: (g) => drawBox(g, rect, WALL_HEIGHT, colors, horizontal, i === 0, i === n - 1, seam),
    });
  }
  return chunks;
}

/** A boulder: an extruded octagon with a lit, bevelled top. */
export function rockChunk(rock: GardenRock): Chunk {
  const c = Math.min(24, rock.width / 3.2, rock.height / 3.2);
  const x0 = rock.x;
  const x1 = rock.x + rock.width;
  const y0 = rock.y;
  const y1 = rock.y + rock.height;
  // boulders are lumpy: a deterministic nudge of each corner, from the rock's own name
  let seed = 0;
  for (const ch of rock.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const nudge = (i: number): number => {
    seed = (Math.imul(seed ^ (i + 1), 2654435761) >>> 0) % 1000;
    return (seed / 1000 - 0.5) * 12;
  };
  const ring: [number, number][] = (
    [
      [x0 + c, y0],
      [x1 - c, y0],
      [x1, y0 + c],
      [x1, y1 - c],
      [x1 - c, y1],
      [x0 + c, y1],
      [x0, y1 - c],
      [x0, y0 + c],
    ] as [number, number][]
  ).map(([x, y], i) => [x + nudge(i), y + nudge(i + 8)]);
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const TAPER = 0.9;
  const top = ring.map(([x, y]) =>
    project(mx + (x - mx) * TAPER, my + (y - my) * TAPER, ROCK_HEIGHT),
  );
  const base = ring.map(([x, y]) => project(x, y, 0));
  return {
    depth: project((x0 + x1) / 2, y1).y,
    box: boundsOf([...top, ...base]),
    draw: (g) => {
      for (let i = 0; i < ring.length; i += 1) {
        const j = (i + 1) % ring.length;
        const a = ring[i] as [number, number];
        const b = ring[j] as [number, number];
        const nx = b[1] - a[1];
        const ny = a[0] - b[0]; // outward normal for this winding
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        const facing = nx * (CAMERA_COLUMN - mx) + ny * (6000 - my);
        if (facing <= 0) continue;
        const lateral = Math.abs(nx) / (Math.abs(nx) + Math.abs(ny));
        poly(
          g,
          [top[i] as Point, top[j] as Point, base[j] as Point, base[i] as Point],
          mix(PALETTE.rockSide, PALETTE.rockDeep, lateral * 0.7),
        );
      }
      poly(g, top, PALETTE.rockTop);
      const inset = ring.map(([x, y]) =>
        project(mx + (x - mx) * TAPER * 0.8 - 4, my + (y - my) * TAPER * 0.8 - 4, ROCK_HEIGHT),
      );
      poly(g, inset, PALETTE.rockHighlight, 0.55);
      // a lit facet on the upper left and a darker lower body: a rounder, heavier look
      poly(
        g,
        [top[7] as Point, top[0] as Point, top[1] as Point, inset[1] as Point, inset[7] as Point],
        PALETTE.rockHighlight,
        0.5,
      );
      poly(
        g,
        [
          base[4] as Point,
          base[5] as Point,
          base[6] as Point,
          mixPoint(base[6] as Point, top[6] as Point),
          mixPoint(base[4] as Point, top[4] as Point),
        ],
        PALETTE.rockDeep,
        0.35,
      );
      g.lineStyle(3, PALETTE.rockDeep, 0.25);
      g.strokePoints(top as never, true);
    },
  };
}

/** A boulder outside the boundary, placed directly in canvas pixels. */
export function drawExteriorRock(g: G, r: (typeof EXTERIOR_ROCKS)[number]): void {
  const w = r.w / 2;
  const shape = (y: number, k: number): Point[] => [
    { x: r.x - w * 0.55 * k, y: y - r.h * 0.5 },
    { x: r.x + w * 0.5 * k, y: y - r.h * 0.55 },
    { x: r.x + w * k, y: y - r.h * 0.05 },
    { x: r.x + w * 0.7 * k, y: y + r.h * 0.45 },
    { x: r.x - w * 0.6 * k, y: y + r.h * 0.5 },
    { x: r.x - w * k, y },
  ];
  poly(g, shape(r.y, 1.02), PALETTE.rockDeep);
  poly(g, shape(r.y - r.lift * 0.55, 1), PALETTE.rockSide);
  poly(g, shape(r.y - r.h - r.lift + r.h * 0.5, 0.98), PALETTE.rockTop);
}

const treeTrunk = (g: G, t: TreeArt): void => {
  const { x, top, base, w } = t.trunk;
  if (w === 0) return;
  g.fillStyle(PALETTE.birchDark, 1);
  g.fillEllipse(x, base, w * 1.1, 14);
  g.fillStyle(PALETTE.birch, 1);
  g.fillRect(x - w / 2, top, w, base - top);
  g.fillEllipse(x, base, w, 12);
  g.fillStyle(PALETTE.birchDark, 0.8);
  for (let i = 0; i < 4; i += 1)
    g.fillEllipse(x + (i % 2 === 0 ? -6 : 7), top + 14 + i * ((base - top) / 4.4), 9, 12);
};

/** Trees and bushes that frame the arena from outside. */
export function drawTrees(g: G): void {
  for (const t of TREES) {
    for (const f of t.foliage ?? []) {
      g.fillStyle(PALETTE.foliageDeep, 1);
      g.fillCircle(f.x, f.y, f.r);
    }
    treeTrunk(g, t);
    for (const c of t.canopy) {
      g.fillStyle(PALETTE.canopyDark, 1);
      g.fillCircle(c.x + 5, c.y + 6, c.r);
      g.fillStyle(PALETTE.canopy, 1);
      g.fillCircle(c.x, c.y, c.r);
      g.fillStyle(PALETTE.canopyLight, 0.9);
      g.fillCircle(c.x - c.r * 0.22, c.y - c.r * 0.25, c.r * 0.6);
    }
  }
}

/** Leafy plants growing out of the ground inside the arena. */
export function drawPlants(g: G): void {
  for (const p of PLANTS) {
    for (let i = -2; i <= 2; i += 1) {
      const a = -Math.PI / 2 + i * 0.5;
      const len = (34 - Math.abs(i) * 5) * p.s;
      g.fillStyle(i % 2 === 0 ? PALETTE.leaf : PALETTE.leafDark, 1);
      g.fillTriangle(
        p.x - 6 * p.s,
        p.y,
        p.x + 6 * p.s,
        p.y,
        p.x + Math.cos(a) * len,
        p.y + Math.sin(a) * len * 0.8,
      );
    }
  }
}

/** The lever structures: a pink base block, a handle and a glowing blue orb. Decoration in Slice 9. */
export function drawLevers(g: G): void {
  for (const l of LEVERS) {
    g.lineStyle(5, PALETTE.leverBase, 1);
    g.lineBetween(l.base.x - 2, l.base.y - 14, l.orb.x, l.orb.y);
    g.fillStyle(PALETTE.leverOrb, 0.25);
    g.fillCircle(l.orb.x, l.orb.y, 15);
    g.fillStyle(PALETTE.leverOrb, 1);
    g.fillCircle(l.orb.x, l.orb.y, 8);
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(l.orb.x - 2, l.orb.y - 3, 3);
    g.fillStyle(0xb98d78, 1);
    g.fillRoundedRect(l.base.x - 15, l.base.y - 22, 30, 28, 5);
    g.fillStyle(PALETTE.leverBase, 1);
    g.fillRoundedRect(l.base.x - 15, l.base.y - 28, 30, 24, 5);
  }
}

/** The swirling blue portals, redrawn each frame so they turn. Visual only (see docs/GARDEN.md). */
export function drawPortals(g: G, time: number): void {
  g.clear();
  for (const p of PORTALS) {
    const pulse = 1 + 0.05 * Math.sin(time / 260);
    g.fillStyle(PALETTE.rockDeep, 1);
    g.fillEllipse(p.x + 8, p.y, p.rx * 3.2, p.ry * 2.5);
    g.fillStyle(PALETTE.portalGlow, 0.18);
    g.fillEllipse(p.x - 6, p.y, p.rx * 3.4 * pulse, p.ry * 2.5 * pulse);
    g.fillStyle(PALETTE.portalDeep, 0.95);
    g.fillEllipse(p.x, p.y, p.rx * 2, p.ry * 2);
    for (let arm = 0; arm < 3; arm += 1) {
      g.lineStyle(4 - arm * 0.6, arm === 0 ? 0xffffff : PALETTE.portalGlow, 0.9 - arm * 0.2);
      g.beginPath();
      const spin = time / 380 + arm * 2.1;
      for (let i = 0; i <= 24; i += 1) {
        const t = i / 24;
        const a = spin + t * 4.2;
        const r = 1 - t * 0.85;
        const x = p.x + Math.cos(a) * p.rx * r * 0.95;
        const y = p.y + Math.sin(a) * p.ry * r * 0.95;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokePath();
    }
    g.lineStyle(3, PALETTE.portalGlow, 0.9);
    g.strokeEllipse(p.x, p.y, p.rx * 2.1, p.ry * 2.1);
  }
}
