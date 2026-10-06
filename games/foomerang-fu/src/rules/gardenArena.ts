import type { Vec2 } from '@foomerang/game-core';
import type { FuArena, Rect } from './arena';

/**
 * GARDEN — the first production arena (Slice 9): the authoritative geometry of "Garden Map - Fu" (the reference image in
 * the repository root), as DATA owned by the rules. Presentation (apps/console/src/render/garden) draws it; it never decides
 * what blocks anything.
 *
 * How it was made: the reference was analysed with a camera model fitted to its dashed arena boundary (see docs/GARDEN.md
 * and scripts/garden); every wall and rock top face was measured in the image and unprojected onto the ground plane.
 * The playable boundary (the dashed rectangle) is 1440 x 1456 world units, which is also the arena size. Walls are 36
 * units thick (the rules' minimum, one player radius: the reference's 30–34 measured, rounded up); rocks are chunky polygons that the rules (which only know axis-aligned rectangles) see as two overlapping
 * rectangles each: a cross whose corners are cut by 16 units, close to the boulders' visible chamfers.
 *
 * The arena uses no gates, platforms or hazards: the reference has none the approved Slice 6 systems could represent without
 * changing its layout. The olive barricades are permanent solid walls (the levers beside them are decoration; see GARDEN.md).
 */
export const GARDEN_WIDTH = 1440;
export const GARDEN_HEIGHT = 1456;
/** The thickness of every wall. */
export const GARDEN_WALL_THICKNESS = 36;
const CHAMFER = 16;

export interface GardenWall extends Rect {
  readonly id: string;
  /** STONE (chunky lavender) or OLIVE (the darker barricade). Both are solid. */
  readonly kind: 'STONE' | 'OLIVE';
}
export interface GardenRock extends Rect {
  readonly id: string;
}

/** Every straight wall run of the reference. */
export const GARDEN_WALLS: readonly GardenWall[] = Object.freeze([
  Object.freeze({ id: 'H1', kind: 'STONE', x: 94, y: 94, width: 468, height: 36 }),
  Object.freeze({ id: 'H2', kind: 'STONE', x: 692, y: 94, width: 182, height: 36 }),
  Object.freeze({ id: 'H3', kind: 'STONE', x: 1214, y: 94, width: 134, height: 36 }),
  Object.freeze({ id: 'HO1', kind: 'OLIVE', x: 1032, y: 114, width: 180, height: 36 }),
  Object.freeze({ id: 'H4', kind: 'STONE', x: 1310, y: 300, width: 130, height: 36 }),
  Object.freeze({ id: 'H5', kind: 'STONE', x: 336, y: 314, width: 72, height: 36 }),
  Object.freeze({ id: 'H6', kind: 'STONE', x: 412, y: 500, width: 308, height: 36 }),
  Object.freeze({ id: 'H7', kind: 'STONE', x: 1038, y: 500, width: 290, height: 36 }),
  Object.freeze({ id: 'HO2', kind: 'OLIVE', x: 716, y: 724, width: 158, height: 36 }),
  Object.freeze({ id: 'H8', kind: 'STONE', x: 0, y: 706, width: 408, height: 36 }),
  Object.freeze({ id: 'H9', kind: 'STONE', x: 382, y: 904, width: 186, height: 36 }),
  Object.freeze({ id: 'H10', kind: 'STONE', x: 876, y: 904, width: 310, height: 36 }),
  Object.freeze({ id: 'H11', kind: 'STONE', x: 246, y: 1146, width: 158, height: 36 }),
  Object.freeze({ id: 'H12', kind: 'STONE', x: 716, y: 1142, width: 314, height: 36 }),
  Object.freeze({ id: 'H13', kind: 'STONE', x: 1186, y: 1140, width: 160, height: 36 }),
  Object.freeze({ id: 'H14', kind: 'STONE', x: 94, y: 1336, width: 782, height: 36 }),
  Object.freeze({ id: 'H15', kind: 'STONE', x: 1132, y: 1346, width: 52, height: 36 }),
  Object.freeze({ id: 'H16', kind: 'STONE', x: 1186, y: 706, width: 122, height: 36 }),
  Object.freeze({ id: 'V1', kind: 'STONE', x: 92, y: 94, width: 36, height: 432 }),
  Object.freeze({ id: 'V2', kind: 'STONE', x: 688, y: 94, width: 36, height: 230 }),
  Object.freeze({ id: 'V3', kind: 'STONE', x: 1308, y: 94, width: 36, height: 238 }),
  Object.freeze({ id: 'V4', kind: 'STONE', x: 1022, y: 114, width: 36, height: 218 }),
  Object.freeze({ id: 'V5', kind: 'STONE', x: 250, y: 408, width: 36, height: 256 }),
  Object.freeze({ id: 'V6', kind: 'STONE', x: 378, y: 704, width: 36, height: 230 }),
  Object.freeze({ id: 'V7', kind: 'STONE', x: 534, y: 734, width: 36, height: 200 }),
  Object.freeze({ id: 'V8', kind: 'STONE', x: 532, y: 330, width: 36, height: 124 }),
  Object.freeze({ id: 'V9', kind: 'STONE', x: 868, y: 334, width: 36, height: 396 }),
  Object.freeze({ id: 'V10', kind: 'STONE', x: 1178, y: 332, width: 36, height: 196 }),
  Object.freeze({ id: 'V11', kind: 'STONE', x: 688, y: 734, width: 36, height: 82 }),
  Object.freeze({ id: 'V12', kind: 'STONE', x: 688, y: 496, width: 36, height: 170 }),
  Object.freeze({ id: 'V13', kind: 'STONE', x: 1024, y: 746, width: 36, height: 118 }),
  Object.freeze({ id: 'V14', kind: 'STONE', x: 1310, y: 778, width: 36, height: 556 }),
  Object.freeze({ id: 'V15', kind: 'STONE', x: 94, y: 1004, width: 36, height: 366 }),
  Object.freeze({ id: 'V16', kind: 'STONE', x: 222, y: 1110, width: 36, height: 62 }),
  Object.freeze({ id: 'V17', kind: 'STONE', x: 1004, y: 1334, width: 36, height: 122 }),
  Object.freeze({ id: 'VO18', kind: 'OLIVE', x: 690, y: 1130, width: 36, height: 178 }),
]);

/** The big boulders (the decorative one outside the boundary is presentation only). */
export const GARDEN_ROCKS: readonly GardenRock[] = Object.freeze([
  Object.freeze({ id: 'R1', x: 224, y: 294, width: 112, height: 124 }),
  Object.freeze({ id: 'R2a', x: 72, y: 892, width: 102, height: 84 }),
  Object.freeze({ id: 'R2b', x: 154, y: 884, width: 88, height: 106 }),
  Object.freeze({ id: 'R2c', x: 138, y: 1032, width: 88, height: 100 }),
  Object.freeze({ id: 'R3a', x: 1348, y: 432, width: 92, height: 106 }),
  Object.freeze({ id: 'R3b', x: 1338, y: 548, width: 102, height: 192 }),
  Object.freeze({ id: 'R3c', x: 1310, y: 678, width: 56, height: 84 }),
  Object.freeze({ id: 'R4', x: 1034, y: 1360, width: 96, height: 96 }),
]);

/**
 * One spawn per slot, ordered so that EVERY prefix (2 to 6 players) is well spread: slot 0 top-left, then the farthest from
 * the ones already chosen. All are outside walls with at least 66 units of clearance, and no two have a clear line within
 * a throw's reach. The match's slot rotation is the platform's, unchanged.
 */
export const GARDEN_SPAWNS: readonly Vec2[] = Object.freeze([
  Object.freeze({ x: 352, y: 224 }),
  Object.freeze({ x: 256, y: 1248 }),
  Object.freeze({ x: 1152, y: 224 }),
  Object.freeze({ x: 1024, y: 1056 }),
  Object.freeze({ x: 800, y: 640 }),
  Object.freeze({ x: 288, y: 832 }),
]);

/** Where Books may appear: open floor away from every spawn. */
export const GARDEN_BOOK_SPOTS: readonly Vec2[] = Object.freeze([
  Object.freeze({ x: 1248, y: 624 }),
  Object.freeze({ x: 624, y: 1080 }),
  Object.freeze({ x: 816, y: 264 }),
  Object.freeze({ x: 72, y: 600 }),
  Object.freeze({ x: 504, y: 624 }),
  Object.freeze({ x: 1224, y: 1272 }),
  Object.freeze({ x: 840, y: 1248 }),
  Object.freeze({ x: 792, y: 912 }),
]);

/** A rock as the rules see it: two overlapping rectangles (a cross with cut corners). */
export function rockRects(rock: Rect): readonly Rect[] {
  const c = Math.max(0, Math.min(CHAMFER, (Math.min(rock.width, rock.height) - 36) / 2));
  return [
    { x: rock.x, y: rock.y + c, width: rock.width, height: rock.height - 2 * c },
    { x: rock.x + c, y: rock.y, width: rock.width - 2 * c, height: rock.height },
  ];
}

/** Garden as the rules' arena: walls plus the rocks' rectangles. */
export const GARDEN_ARENA: FuArena = Object.freeze({
  width: GARDEN_WIDTH,
  height: GARDEN_HEIGHT,
  walls: Object.freeze([
    ...GARDEN_WALLS.map(({ x, y, width, height }) => Object.freeze({ x, y, width, height })),
    ...GARDEN_ROCKS.flatMap((rock) => rockRects(rock).map((rect) => Object.freeze(rect))),
  ]),
  spawns: GARDEN_SPAWNS,
});
