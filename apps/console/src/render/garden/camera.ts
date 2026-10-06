/**
 * Garden's camera: a pinhole camera looking down at the arena's ground plane, FITTED to the reference image (see
 * docs/GARDEN.md): the horizon, the vanishing point of the dashed arena boundary and the heights of the walls were measured
 * in "Garden Map - Fu", and every number below comes from that fit, not from taste. Pure maths: no Phaser, so it can be tested.
 *
 * Coordinates: the arena's own (x right, y toward the viewer, z up, all in world units) → canvas pixels in a 1999 × 1138
 * canvas, the reference's proportions. A point of the ground, a wall's top (z = 36) or a character's head (z ≈ 70) all go
 * through the same function, which is what makes tall things lean the way the reference's do.
 */
export const CANVAS_WIDTH = 1999;
export const CANVAS_HEIGHT = 1138;

/** Row of the image's principal point, and of the horizon (far above the frame: a long lens, so mild perspective). */
const CENTRE_Y = 569;
const HORIZON_Y = -5394;
/** The column the ground's depth lines converge on. */
const CENTRE_X = 1021;
/** Pitch of the camera below the horizontal, 40°. */
const PITCH = (40 * Math.PI) / 180;
const FOCAL = (CENTRE_Y - HORIZON_Y) / Math.tan(PITCH);
/** World units are such that a unit is about one pixel across the middle of the frame. */
const SCALE_AT_CENTRE = 1.04;
const CAMERA_HEIGHT = ((CENTRE_Y - HORIZON_Y) * Math.cos(PITCH)) / SCALE_AT_CENTRE;
/** Where the arena's (0, 0) corner lies in the camera's own frame (lateral offset, ground distance from the camera). */
const ORIGIN_X = -800.4;
const ORIGIN_DEPTH = 6033.1;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export const WALL_HEIGHT = 36;
export const ROCK_HEIGHT = 80;

/** Arena point (x, y) at height z → canvas pixels. */
export function project(x: number, y: number, z = 0): Point {
  const lateral = x + ORIGIN_X;
  const depth = ORIGIN_DEPTH - y;
  const height = CAMERA_HEIGHT - z;
  const forward = depth * Math.cos(PITCH) + height * Math.sin(PITCH);
  const down = height * Math.cos(PITCH) - depth * Math.sin(PITCH);
  return { x: CENTRE_X + (FOCAL * lateral) / forward, y: CENTRE_Y + (FOCAL * down) / forward };
}

/** Canvas pixels → the arena point (x, y) that lies at height z there: the inverse of `project`. */
export function unproject(sx: number, sy: number, z = 0): Point {
  const w = sy - HORIZON_Y;
  const height = CAMERA_HEIGHT - z;
  const forward = (FOCAL * height) / (w * Math.cos(PITCH));
  const lateral = ((sx - CENTRE_X) * forward) / FOCAL;
  const depth = (forward - height * Math.sin(PITCH)) / Math.cos(PITCH);
  return { x: lateral - ORIGIN_X, y: ORIGIN_DEPTH - depth };
}

/** How many canvas pixels one world unit is, along the ground, at an arena point (x across, y deep). */
export function groundScale(x: number, y: number): { readonly sx: number; readonly sy: number } {
  const a = project(x, y);
  const right = project(x + 1, y);
  const down = project(x, y + 1);
  return { sx: Math.abs(right.x - a.x), sy: Math.abs(down.y - a.y) };
}

/** Screen height of one world unit of "up" at an arena point (how tall a character of a given height is drawn). */
export function upScale(x: number, y: number): number {
  const a = project(x, y, 0);
  const b = project(x, y, 10);
  return Math.abs(a.y - b.y) / 10;
}

/** The camera stands over this arena column: walls to its left show their right face, to its right their left face. */
export const CAMERA_COLUMN = -ORIGIN_X;
