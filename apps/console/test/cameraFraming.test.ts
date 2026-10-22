import { describe, expect, it } from 'vitest';
import { CAMERA_FRAMING, frameTarget, springCamera } from '../src/render/cameraFraming';

// The camera, as the reference video's moves on the plaza (1:56–2:28.5; its frame registered to our map every frame, so its zoom
// and centre are exact): it keeps every living player in view with room round them, as close as that allows, between its
// widest view (1,502 px of the map's 1280: ≈ 0.85×) and its narrowest (985 px: ≈ 1.3×), gliding there over ≈ a second; it holds
// still until it has to move. Its usual
// view is wider than environ2's frame: 1,389 px (≈ 0.92×) at the median, centred at (681, 392) of the map's (640, 360). It never
// shows beyond what the video ever showed (the union of its views; the floor carries the video's own ground out there).
// Positions are where the resting camera (environ2's frame) shows them on screen: -1 (left / bottom) … 1 (right / top).

const inArt = (t: { zoom: number; u: number; v: number }) => {
  const { u0, u1, v0, v1 } = CAMERA_FRAMING.art;
  const half = 1 / t.zoom;
  return (
    t.u - half >= u0 - 1e-9 &&
    t.u + half <= u1 + 1e-9 &&
    t.v - half >= v0 - 1e-9 &&
    t.v + half <= v1 + 1e-9
  );
};

describe('the camera’s framing', () => {
  it('with the players spread over the plaza, shows the video’s widest view (≈ 0.85×), centred on them', () => {
    const t = frameTarget([
      { u: -0.8, v: -0.6 },
      { u: 0.7, v: 0.5 },
    ]);
    expect(t.zoom).toBeCloseTo(CAMERA_FRAMING.minZoom, 9);
    expect(CAMERA_FRAMING.minZoom).toBeCloseTo(1280 / 1502, 3);
    expect(t.u).toBeCloseTo(-0.05, 9);
    expect(t.v).toBeCloseTo(-0.05, 9);
    expect(inArt(t)).toBe(true);
  });

  it('with the last players close together, closes in on them, but no closer than ≈ 1.3×', () => {
    const near = frameTarget([
      { u: 0.4, v: 0.1 },
      { u: 0.5, v: 0.2 },
    ]);
    expect(near.zoom).toBeCloseTo(CAMERA_FRAMING.maxZoom, 9);
    expect(CAMERA_FRAMING.maxZoom).toBeCloseTo(1280 / 985, 1);
    expect(near.u).toBeCloseTo(0.45, 9);
    expect(near.v).toBeCloseTo(0.15, 9);
  });

  it('keeps everyone in view, with room round them: a closer view only when they all fit in it', () => {
    const pts = [
      { u: -0.3, v: 0 },
      { u: 0.3, v: 0.1 },
    ];
    const t = frameTarget(pts);
    for (const p of pts) {
      expect(Math.abs(p.u - t.u) * t.zoom).toBeLessThanOrEqual(
        1 - CAMERA_FRAMING.padding * t.zoom + 1e-9,
      );
    }
  });

  it('never shows beyond what the video ever showed round the plaza', () => {
    for (const p of [
      { u: -1.3, v: 0.9 },
      { u: 1.4, v: -1.7 },
      { u: 1.4, v: 1.2 },
      { u: -1.3, v: -1.7 },
    ]) {
      const t = frameTarget([p]);
      expect(inArt(t)).toBe(true);
    }
    // the art is the union of the video's views (map px -201…1544 across, -79…992 down)
    expect(CAMERA_FRAMING.art.u0).toBeCloseTo((-201 - 640) / 640, 2);
    expect(CAMERA_FRAMING.art.v1).toBeCloseTo((360 + 79) / 360, 2);
  });

  it('nobody to frame (between rounds): the video’s usual view, ≈ 0.92× and a little right of and below environ2’s', () => {
    const t = frameTarget([]);
    expect(t.zoom).toBeCloseTo(1280 / 1389, 3);
    expect(t.u).toBeCloseTo((681 - 640) / 640, 3);
    expect(t.v).toBeCloseTo(-(392 - 360) / 360, 3);
    expect(t).toEqual(CAMERA_FRAMING.rest);
  });

  it('holds still while everyone stays well inside its view, as the video’s does (1,292 px wide for 2 s, 2:22.5–2:24.5)', () => {
    const pts = [
      { u: -0.3, v: 0 },
      { u: 0.3, v: 0.1 },
    ];
    const held = frameTarget(pts);
    const moved = [
      { u: -0.25, v: 0.05 },
      { u: 0.35, v: 0.0 },
    ];
    expect(frameTarget(moved, held)).toBe(held);
  });

  it('moves once someone nears the edge of its view, framing them with room again', () => {
    const held = frameTarget([
      { u: -0.3, v: 0 },
      { u: 0.3, v: 0.1 },
    ]);
    const out = [
      { u: -0.3, v: 0 },
      { u: held.u + (1 - CAMERA_FRAMING.holdEdge / 2) / held.zoom, v: 0.1 },
    ];
    const t = frameTarget(out, held);
    expect(t).not.toBe(held);
    expect(t).toEqual(frameTarget(out));
  });

  it('closes in once they have drawn together enough for a clearly closer view', () => {
    const held = frameTarget([
      { u: -0.6, v: 0 },
      { u: 0.6, v: 0 },
    ]);
    const a = frameTarget(
      [
        { u: -0.55, v: 0 },
        { u: 0.5, v: 0 },
      ],
      held,
    );
    expect(a).toBe(held);
    const b = frameTarget(
      [
        { u: -0.1, v: 0 },
        { u: 0.1, v: 0 },
      ],
      held,
    );
    expect(b.zoom).toBeGreaterThan(held.zoom * CAMERA_FRAMING.holdCloser);
  });

  it('nobody to frame: back to its usual view, whatever it held', () => {
    const held = frameTarget([{ u: 0.4, v: 0.1 }]);
    expect(frameTarget([], held)).toBe(CAMERA_FRAMING.rest);
  });

  it('glides there on a spring: starting gently, most of the way in about a second, never overshooting', () => {
    const to = { zoom: 1.3, u: 0.2, v: 0 };
    let m = { frame: { zoom: 1, u: 0, v: 0 }, velocity: { zoom: 0, u: 0, v: 0 } };
    const trace: number[] = [];
    for (let i = 0; i < 180; i += 1) {
      m = springCamera(m, to, 1 / 60);
      trace.push(m.frame.zoom);
    }
    const [at2 = 0, at5 = 0, at59 = 0] = [trace[2], trace[5], trace[59]];
    expect(at2 - 1).toBeLessThan(0.01); // no jump: it starts from rest
    expect(at5).toBeLessThan(1.05);
    expect(at59).toBeGreaterThan(1.25);
    expect(Math.max(...trace)).toBeLessThanOrEqual(1.3 + 1e-9);
    expect(m.frame.u).toBeCloseTo(0.2, 2);
  });

  it('a new target mid-glide keeps its motion smooth: no sudden change of speed', () => {
    let m = { frame: { zoom: 1, u: 0, v: 0 }, velocity: { zoom: 0, u: 0, v: 0 } };
    for (let i = 0; i < 20; i += 1) m = springCamera(m, { zoom: 1, u: 0.5, v: 0 }, 1 / 60);
    const before = m.velocity.u;
    m = springCamera(m, { zoom: 1, u: -0.5, v: 0 }, 1 / 60);
    expect(Math.abs(m.velocity.u - before)).toBeLessThan(Math.abs(before) * 0.5);
  });
});
