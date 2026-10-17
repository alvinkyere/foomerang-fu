import type { MapCameraConfig } from '../reconstructed/mapCamera';

/**
 * The bridge between the rules' world (game units, x right, y toward the viewer) and the 3D plaza scene: the models were
 * built in Blender units (100 per plan unit, Z up) and exported Y-up, so a Blender point (X, Y, Z) is the scene point
 * (X, Z, -Y). The plan mapping is the map camera's (`world`). Pure maths: no three.js, so it can be tested.
 */
export interface ScenePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const BU_PER_PLAN = 100;

export function sceneSpace(camera: MapCameraConfig) {
  const { unitsPerPlanUnit: u, planOriginX, planOriginY } = camera.world;
  return {
    /** World point (x, y) at height z (world units) -> scene point. */
    toScene(x: number, y: number, z = 0): ScenePoint {
      const X = (x / u + planOriginX) * BU_PER_PLAN;
      const Y = (planOriginY - y / u) * BU_PER_PLAN;
      return { x: X, y: (z / u) * BU_PER_PLAN, z: -Y };
    },
    /** A length in world units -> scene units. */
    length(worldUnits: number): number {
      return (worldUnits / u) * BU_PER_PLAN;
    },
  };
}

/** How tall (scene units) a character cell must be at `distance` to be drawn `cell * scale` px tall on the map's canvas. */
export const characterHeight = (
  camera: MapCameraConfig,
  cell: number,
  scale: number,
  distance: number,
): number => (cell * scale * distance) / camera.focalPx;
