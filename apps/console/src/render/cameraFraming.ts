/**
 * The camera's framing, as the reference video's camera moves on the plaza (1:56–2:28.5; the footage registered to our map
 * every frame, so its zoom and centre are exact: art/physics_reference/README.md, "The camera"). It keeps every living player in
 * view with room round them, as close as that allows, between its widest view (1,502 px of the map's 1280: ≈ 0.85×) and its
 * narrowest (985 px: ≈ 1.3×); it eases there, a change settling in about a second. Its usual view is wider than environ2's
 * frame (1,389 px at the median), and it never shows beyond what the video ever showed: the floor carries the video's own
 * ground out there (art/physics_reference/outskirts.py). Pure maths: the 3D plaza crops its resting view to it (a 2D zoom and
 * pan, as the footage's is).
 *
 * Positions are where the resting camera (environ2's frame) shows a point: u -1 (left) … 1 (right), v -1 (bottom) … 1 (top).
 */
export const CAMERA_FRAMING = Object.freeze({
  minZoom: 1280 / 1502,
  maxZoom: 1.3,
  /** Room round the players, as a fraction of the resting screen's half-width (two 400 px apart give the closest view). */
  padding: 0.46,
  /** How quickly it eases: the time for ≈ 63% of a change, seconds. */
  ease: 0.35,
  /** Between rounds: the video's median view, 1,389 px wide, centred at (681, 392) of the map. */
  rest: Object.freeze({ zoom: 1280 / 1389, u: (681 - 640) / 640, v: -(392 - 360) / 360 }),
  /** All the video ever showed round the plaza (the union of its views: map px -201…1544 across, -79…992 down). */
  art: Object.freeze({
    u0: (-201 - 640) / 640,
    u1: (1544 - 640) / 640,
    v0: -(992 - 360) / 360,
    v1: (360 + 79) / 360,
  }),
});

export interface CameraFrame {
  /** 1: environ2's frame; more: closer. */
  readonly zoom: number;
  /** The centre of the view, where the resting camera shows it (u, v). */
  readonly u: number;
  readonly v: number;
}

/** Where the camera should be to frame these players (their resting screen positions). */
export function frameTarget(
  points: readonly { readonly u: number; readonly v: number }[],
): CameraFrame {
  if (points.length === 0) return CAMERA_FRAMING.rest;
  const us = points.map((p) => p.u);
  const vs = points.map((p) => p.v);
  const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  const pad = CAMERA_FRAMING.padding;
  const zoom = Math.min(
    CAMERA_FRAMING.maxZoom,
    Math.max(CAMERA_FRAMING.minZoom, Math.min(2 / (u1 - u0 + 2 * pad), 2 / (v1 - v0 + 2 * pad))),
  );
  // the view never leaves what the video showed: its centre stays where all of the view is inside that
  const half = 1 / zoom;
  const { art } = CAMERA_FRAMING;
  const clamp = (c: number, lo: number, hi: number) =>
    Math.min(hi - half, Math.max(lo + half, c)) + 0; // (+ 0: never -0)
  return { zoom, u: clamp((u0 + u1) / 2, art.u0, art.u1), v: clamp((v0 + v1) / 2, art.v0, art.v1) };
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
