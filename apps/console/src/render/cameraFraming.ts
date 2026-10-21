/**
 * The camera's framing, as the reference video's camera moves on the plaza (1:56–2:39.5; the footage registered to our map
 * every frame, so its zoom and centre are exact: art/physics_reference/README.md, "The camera"). It keeps every living player in
 * view with room round them, as close as that allows: never wider than the whole plaza, never closer than ≈ 1.3× (its narrowest
 * view, 985 px of the map's 1280); it eases there, a change settling in about a second. With the players spread it shows the
 * whole plaza; with the last two close together it closes in on them (2:38.5–2:39.25). Pure maths: the 3D plaza crops its
 * resting view to it (a 2D zoom and pan, as the footage's is).
 *
 * Positions are where the resting camera shows a point: u -1 (left) … 1 (right), v -1 (bottom) … 1 (top).
 */
export const CAMERA_FRAMING = Object.freeze({
  maxZoom: 1.3,
  /** Room round the players, as a fraction of the resting screen's half-width (two 400 px apart give the closest view). */
  padding: 0.46,
  /** How quickly it eases: the time for ≈ 63% of a change, seconds. */
  ease: 0.35,
});

export interface CameraFrame {
  /** 1: the resting view; more: closer. */
  readonly zoom: number;
  /** The centre of the view, where the resting camera shows it (u, v). */
  readonly u: number;
  readonly v: number;
}

const REST: CameraFrame = Object.freeze({ zoom: 1, u: 0, v: 0 });

/** Where the camera should be to frame these players (their resting screen positions). */
export function frameTarget(
  points: readonly { readonly u: number; readonly v: number }[],
): CameraFrame {
  if (points.length === 0) return REST;
  const us = points.map((p) => p.u);
  const vs = points.map((p) => p.v);
  const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  const pad = CAMERA_FRAMING.padding;
  const zoom = Math.min(
    CAMERA_FRAMING.maxZoom,
    Math.max(1, Math.min(2 / (u1 - u0 + 2 * pad), 2 / (v1 - v0 + 2 * pad))),
  );
  // the view never leaves the plaza: its centre stays where the whole of it is inside the resting view
  const room = 1 - 1 / zoom;
  const clamp = (c: number) => Math.min(room, Math.max(-room, c)) + 0; // (+ 0: never -0)
  return { zoom, u: clamp((u0 + u1) / 2), v: clamp((v0 + v1) / 2) };
}

/** The camera `dt` seconds on, eased from where it is towards `target`. */
export function easeCamera(from: CameraFrame, target: CameraFrame, dt: number): CameraFrame {
  const k = 1 - Math.exp(-dt / CAMERA_FRAMING.ease);
  return {
    zoom: from.zoom + (target.zoom - from.zoom) * k,
    u: from.u + (target.u - from.u) * k,
    v: from.v + (target.v - from.v) * k,
  };
}
