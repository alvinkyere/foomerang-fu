import { describe, expect, it } from 'vitest';
import {
  circleHitsWalls,
  distanceToSolid,
  lineIsClear,
  nearestWallNormal,
  pushOutOfSolid,
  sweepCircle,
  type Solid,
} from '../src/rules/arena';
import { createFuMatch, stepFu, type FuArena } from '../src/rules';
import { DT, R, at, input } from './support/fixtures';

// Real shapes (owner, 2026-10-17): the plaza's pots, posts and fountain are round, its crates and stalls are boxes turned the
// way the models stand. A wall may be an axis-aligned rectangle (as ever), a DISC (centre and radius) or a TURNED BOX
// (centre, half sizes and an angle in radians, clockwise on screen since +Y is down). Every rule that meets a wall meets
// these the same way: movement, push-out, boomerangs, line of sight.

const disc: Solid = { shape: 'disc', x: 500, y: 400, radius: 40 };
const box: Solid = {
  shape: 'box',
  x: 500,
  y: 400,
  halfWidth: 60,
  halfHeight: 20,
  angle: Math.PI / 4,
};

describe('a disc', () => {
  it('distance is measured from its rim; 0 inside it', () => {
    expect(distanceToSolid({ x: 600, y: 400 }, disc)).toBeCloseTo(60, 9);
    expect(distanceToSolid({ x: 510, y: 410 }, disc)).toBe(0);
  });

  it('a body touching it is free; overlapping it is pushed straight out, radially', () => {
    expect(circleHitsWalls({ x: 576, y: 400 }, 36, [disc])).toBe(false);
    expect(circleHitsWalls({ x: 570, y: 400 }, 36, [disc])).toBe(true);
    const out = pushOutOfSolid(500, 460, 36, disc, 1e-9);
    expect(out?.[0]).toBeCloseTo(500, 9);
    expect(out?.[1]).toBeCloseTo(476, 9);
  });

  it('blocks a sweep at its rim, and a line through it', () => {
    const swept = sweepCircle({ x: 300, y: 400 }, { x: 700, y: 400 }, 36, [disc]);
    expect(swept.blocked).toBe(true);
    expect(swept.position.x).toBeCloseTo(500 - 40 - 36, 3);
    expect(lineIsClear({ x: 300, y: 400 }, { x: 700, y: 400 }, [disc])).toBe(false);
    expect(lineIsClear({ x: 300, y: 450 }, { x: 700, y: 450 }, [disc])).toBe(true);
  });

  it('its normal points away from the centre', () => {
    const n = nearestWallNormal({ x: 500, y: 300 }, [disc]);
    expect(n?.x).toBeCloseTo(0, 9);
    expect(n?.y).toBeCloseTo(-1, 9);
  });
});

describe('a turned box', () => {
  it('is measured in its own frame: along its long axis it reaches 60, across it only 20', () => {
    const along = { x: 500 + 60 * Math.SQRT1_2, y: 400 + 60 * Math.SQRT1_2 };
    expect(distanceToSolid(along, box)).toBeCloseTo(0, 9);
    // the same 60 straight right is well outside the turned box
    expect(distanceToSolid({ x: 560, y: 400 }, box)).toBeGreaterThan(10);
    const across = { x: 500 - 30 * Math.SQRT1_2, y: 400 + 30 * Math.SQRT1_2 };
    expect(distanceToSolid(across, box)).toBeCloseTo(10, 9);
  });

  it('a body overlapping a face leaves along that face’s normal', () => {
    const p = { x: 500 - 30 * Math.SQRT1_2, y: 400 + 30 * Math.SQRT1_2 };
    const out = pushOutOfSolid(p.x, p.y, 36, box, 1e-9);
    if (out === undefined) throw new Error('not pushed');
    expect(distanceToSolid({ x: out[0], y: out[1] }, box)).toBeCloseTo(36, 6);
    const n = nearestWallNormal(p, [box]);
    expect(n?.x).toBeCloseTo(-Math.SQRT1_2, 9);
    expect(n?.y).toBeCloseTo(Math.SQRT1_2, 9);
  });

  it('a line past its corner is clear where the same box unturned would block it', () => {
    expect(lineIsClear({ x: 380, y: 330 }, { x: 620, y: 330 }, [box])).toBe(true);
    expect(lineIsClear({ x: 380, y: 400 }, { x: 620, y: 400 }, [box])).toBe(false);
  });
});

describe('real shapes in a match', () => {
  const arena: FuArena = {
    width: 1600,
    height: 900,
    walls: [
      { shape: 'disc', x: 800, y: 450, radius: 40 },
      { shape: 'box', x: 400, y: 450, halfWidth: 50, halfHeight: 20, angle: Math.PI / 6 },
    ],
    spawns: [
      { x: 600, y: 450 },
      { x: 1200, y: 450 },
      { x: 200, y: 200 },
      { x: 200, y: 700 },
      { x: 1400, y: 200 },
      { x: 1400, y: 700 },
    ],
  };

  it('a player walking into a pot stops at its rim', () => {
    let s = createFuMatch(
      [
        { id: 'a', slot: 0 },
        { id: 'b', slot: 1 },
      ],
      { arena, seed: 1 },
    );
    for (let t = 0; t < 1.5; t += DT)
      s = stepFu(s, input({ a: { move: { x: 1, y: 0 } } }), DT).state;
    expect(at(s, 'a').x).toBeCloseTo(800 - 40 - R, 0);
  });

  it('a player pushing diagonally against a pot slides round it, never into it', () => {
    let s = createFuMatch(
      [
        { id: 'a', slot: 0 },
        { id: 'b', slot: 1 },
      ],
      { arena, seed: 1 },
    );
    for (let t = 0; t < 3; t += DT) {
      s = stepFu(s, input({ a: { move: { x: 1, y: 0.15 } } }), DT).state;
      expect(
        distanceToSolid(at(s, 'a'), { shape: 'disc', x: 800, y: 450, radius: 40 }),
      ).toBeGreaterThan(R - 0.5);
    }
    expect(at(s, 'a').x, 'got past it').toBeGreaterThan(800);
  });

  it('an arena rejects a disc or turned box thinner than a player radius', () => {
    const bad = (wall: Solid) => () =>
      createFuMatch([{ id: 'a', slot: 0 }], { arena: { ...arena, walls: [wall] } });
    expect(bad({ shape: 'disc', x: 800, y: 450, radius: 10 })).toThrow(/thinner/);
    expect(
      bad({ shape: 'box', x: 800, y: 450, halfWidth: 40, halfHeight: 10, angle: 0.3 }),
    ).toThrow(/thinner/);
  });
});
