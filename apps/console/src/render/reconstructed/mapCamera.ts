/**
 * The game camera of a map reconstructed from the master gameplay video. Each map carries its OWN camera, solved from the
 * reference footage (art/reconstruction: vanishing-point calibration + ground tracking) and shipped as data in the map's
 * manifest; the baked environment layers and character atlases were rendered through exactly this camera, so a world point
 * projected here lands on the same pixel as in the baked art. Pure maths: no Phaser, so it can be tested.
 *
 * Solver conventions: a pinhole over the ground in "plan units", world X right, Y away from the viewer, Z up; the camera is
 * pitched down by `pitchDeg`, then yawed about Z and rolled about the optical axis (R = Rroll · Rpitch · Ryaw), centred at
 * `centre`. Game world → plan: X = x / u + planOriginX, Y = planOriginY − y / u, Z = z / u (game y grows toward the viewer).
 */
export interface MapCameraConfig {
  readonly canvas: { readonly width: number; readonly height: number };
  readonly focalPx: number;
  readonly principal: { readonly x: number; readonly y: number };
  readonly pitchDeg: number;
  readonly yawDeg: number;
  readonly rollDeg: number;
  readonly centre: readonly [number, number, number];
  readonly world: {
    readonly unitsPerPlanUnit: number;
    readonly planOriginX: number;
    readonly planOriginY: number;
  };
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface MapCamera {
  readonly canvas: { readonly width: number; readonly height: number };
  /** World point (x, y) at height z (all world units) → canvas pixels. */
  project(x: number, y: number, z?: number): Point;
  /** How many canvas pixels one world unit is, along the ground, at (x, y). */
  groundScale(x: number, y: number): { readonly sx: number; readonly sy: number };
}

type Vec = readonly [number, number, number];
type Mat = readonly [Vec, Vec, Vec];
const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const transpose = ([a, b, c]: Mat): Mat => [
  [a[0], b[0], c[0]],
  [a[1], b[1], c[1]],
  [a[2], b[2], c[2]],
];
const apply = ([r0, r1, r2]: Mat, v: Vec): Vec => [dot(r0, v), dot(r1, v), dot(r2, v)];
const mul = (a: Mat, b: Mat): Mat => {
  const [c0, c1, c2] = transpose(b);
  return [
    [dot(a[0], c0), dot(a[0], c1), dot(a[0], c2)],
    [dot(a[1], c0), dot(a[1], c1), dot(a[1], c2)],
    [dot(a[2], c0), dot(a[2], c1), dot(a[2], c2)],
  ];
};

export function createMapCamera(config: MapCameraConfig): MapCamera {
  const rad = Math.PI / 180;
  const [th, yw, rl] = [config.pitchDeg * rad, config.yawDeg * rad, config.rollDeg * rad];
  const pitch: Mat = [
    [1, 0, 0],
    [0, -Math.sin(th), -Math.cos(th)],
    [0, Math.cos(th), -Math.sin(th)],
  ];
  const yaw: Mat = [
    [Math.cos(yw), Math.sin(yw), 0],
    [-Math.sin(yw), Math.cos(yw), 0],
    [0, 0, 1],
  ];
  const roll: Mat = [
    [Math.cos(rl), -Math.sin(rl), 0],
    [Math.sin(rl), Math.cos(rl), 0],
    [0, 0, 1],
  ];
  const R = mul(roll, mul(pitch, yaw));
  const { focalPx: F, principal, centre: C, world } = config;
  const u = world.unitsPerPlanUnit;
  const project = (x: number, y: number, z = 0): Point => {
    const [cx, cy, depth] = apply(R, [
      x / u + world.planOriginX - C[0],
      world.planOriginY - y / u - C[1],
      z / u - C[2],
    ]);
    return { x: (F * cx) / depth + principal.x, y: (F * cy) / depth + principal.y };
  };
  return {
    canvas: config.canvas,
    project,
    groundScale(x, y) {
      const a = project(x, y);
      const right = project(x + 1, y);
      const down = project(x, y + 1);
      return {
        sx: Math.hypot(right.x - a.x, right.y - a.y),
        sy: Math.hypot(down.x - a.x, down.y - a.y),
      };
    },
  };
}

/** The manifest is fetched over the network, so its camera is checked before any maths trusts it. */
export function parseMapCamera(value: unknown): MapCameraConfig {
  const fail = (what: string): never => {
    throw new Error(`map camera: invalid ${what}`);
  };
  const num = (v: unknown, what: string): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fail(what);
  const obj = (v: unknown, what: string): Record<string, unknown> =>
    typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : fail(what);
  const c = obj(value, 'camera');
  const canvas = obj(c['canvas'], 'canvas');
  const width = num(canvas['width'], 'canvas');
  const height = num(canvas['height'], 'canvas');
  if (width <= 0 || height <= 0) fail('canvas');
  const principal = obj(c['principal'], 'principal');
  const centre = c['centre'];
  if (!Array.isArray(centre) || centre.length !== 3) fail('centre');
  const world = obj(c['world'], 'world');
  const focalPx = num(c['focalPx'], 'focalPx');
  if (focalPx <= 0) fail('focalPx');
  const unitsPerPlanUnit = num(world['unitsPerPlanUnit'], 'world');
  if (unitsPerPlanUnit <= 0) fail('world');
  return {
    canvas: { width, height },
    focalPx,
    principal: { x: num(principal['x'], 'principal'), y: num(principal['y'], 'principal') },
    pitchDeg: num(c['pitchDeg'], 'pitchDeg'),
    yawDeg: num(c['yawDeg'], 'yawDeg'),
    rollDeg: num(c['rollDeg'], 'rollDeg'),
    centre: (centre as unknown[]).map((v) => num(v, 'centre')) as unknown as readonly [
      number,
      number,
      number,
    ],
    world: {
      unitsPerPlanUnit,
      planOriginX: num(world['planOriginX'], 'world'),
      planOriginY: num(world['planOriginY'], 'world'),
    },
  };
}
