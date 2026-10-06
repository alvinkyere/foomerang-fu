import type * as Phaser from 'phaser';
import type { Pen } from '../effects';
import { groundScale, project } from '../../garden/camera';

/**
 * A pen that draws on Garden's GROUND PLANE through its camera, so every effect written for the flat arenas (a ring, a
 * burst, a swoosh) lies on the floor in perspective: circles become ellipses, lines and arcs follow the projection. The
 * effects themselves are unchanged; they think they are drawing in arena coordinates.
 */
export function groundPen(g: Phaser.GameObjects.Graphics): Pen {
  const point = (x: number, y: number) => project(x, y);
  return {
    clear: () => g.clear(),
    fillStyle: (c, a) => g.fillStyle(c, a),
    lineStyle: (w, c, a) => g.lineStyle(w, c, a),
    fillCircle: (x, y, r) => {
      const p = point(x, y);
      const s = groundScale(x, y);
      g.fillEllipse(p.x, p.y, 2 * r * s.sx, 2 * r * s.sy);
    },
    strokeCircle: (x, y, r) => {
      const p = point(x, y);
      const s = groundScale(x, y);
      g.strokeEllipse(p.x, p.y, 2 * r * s.sx, 2 * r * s.sy);
    },
    lineBetween: (x1, y1, x2, y2) => {
      const a = point(x1, y1);
      const b = point(x2, y2);
      g.lineBetween(a.x, a.y, b.x, b.y);
    },
    beginPath: () => g.beginPath(),
    moveTo: (x, y) => {
      const p = point(x, y);
      g.moveTo(p.x, p.y);
    },
    arc: (x, y, r, start, end, anticlockwise = false) => {
      let from = start;
      let to = end;
      if (anticlockwise) [from, to] = [to, from];
      const steps = Math.max(4, Math.ceil(Math.abs(to - from) / 0.12));
      for (let i = 0; i <= steps; i += 1) {
        const a = from + ((to - from) * i) / steps;
        const p = point(x + Math.cos(a) * r, y + Math.sin(a) * r);
        g.lineTo(p.x, p.y);
      }
    },
    closePath: () => g.closePath(),
    fillPath: () => g.fillPath(),
    strokePath: () => g.strokePath(),
    destroy: () => g.destroy(),
  };
}
