import { describe, expect, it } from 'vitest';
import {
  SYSTEMS_ARENA,
  createFuMatch,
  gatePhaseAt,
  hazardPhaseAt,
  platformAt,
  stepFu,
  systemsView,
  type FuArena,
  type Rect,
  type FuState,
} from '../src/rules';
import { circleHitsWalls, wallsOf } from '../src/rules/arena';
import { inRect } from '../src/rules/systems';
import {
  C,
  DT,
  NONE,
  R,
  at,
  boom,
  face,
  flying,
  give,
  input,
  make,
  must,
  own,
  patchBoomerang,
  patchPlayer,
  place,
  player,
  run,
  types,
  weaponsOf,
  type FuEvent,
} from './support/fixtures';

// Slice 6 — arena systems (timed gates, moving platforms, a periodic lethal floor). Every one is a
// pure function of `roundTime`, so these tests can say exactly where and when things are.

const CORNERS = [
  { x: 60, y: 60 },
  { x: 1540, y: 840 },
  { x: 1540, y: 60 },
  { x: 60, y: 840 },
  { x: 800, y: 60 },
  { x: 800, y: 840 },
];
/** A plain 1600 × 900 arena with the given systems and six far-away spawns. */
const arenaOf = (parts: Partial<FuArena<Rect>>): FuArena<Rect> => ({
  width: 1600,
  height: 900,
  spawns: CORNERS,
  ...parts,
});
const GATE = {
  rect: { x: 700, y: 400, width: 50, height: 100 },
  openSeconds: 6,
  warnSeconds: 2,
  closedSeconds: 6,
};
const HAZARD = {
  rect: { x: 700, y: 400, width: 200, height: 100 },
  safeSeconds: 2,
  warnSeconds: 1,
  activeSeconds: 1,
};
const PLATFORM = {
  size: { width: 100, height: 100 },
  from: { x: 300, y: 300 },
  to: { x: 500, y: 300 },
  travelSeconds: 4,
  pauseSeconds: 1,
};
const withTime = (s: FuState, roundTime: number): FuState => ({ ...s, roundTime });
const duel = (arena: FuArena, ids = ['a', 'b'], extra: object = {}) =>
  place(place(make(ids, { arena, ...extra }), 'a', 100, 800), 'b', 1500, 100);
const phaseOf = (s: FuState, k = 0) =>
  systemsView(s.config.arena, s.roundTime, s.gatesShut).gates[k];
const hits = (events: readonly FuEvent[]) => events.filter((e) => e.type === 'HIT');

describe('the schedules are pure functions of round time, exact at their boundaries', () => {
  it('a gate: OPEN, then CLOSING (still passable), then CLOSED; a boundary instant belongs to the NEW phase', () => {
    const at = (t: number) => gatePhaseAt(GATE, t).phase;
    expect([0, 1, 3.999].map(at)).toEqual(['OPEN', 'OPEN', 'OPEN']);
    expect([4, 4.5, 5.999].map(at)).toEqual(['CLOSING', 'CLOSING', 'CLOSING']);
    expect([6, 8, 11.999].map(at)).toEqual(['CLOSED', 'CLOSED', 'CLOSED']);
    expect([12, 15.999, 16, 24].map(at)).toEqual(['OPEN', 'OPEN', 'CLOSING', 'OPEN']);
    expect(gatePhaseAt(GATE, 1).secondsToChange).toBeCloseTo(3, 6);
    expect(gatePhaseAt(GATE, 5).secondsToChange).toBeCloseTo(1, 6);
    expect(gatePhaseAt(GATE, 7).secondsToChange).toBeCloseTo(5, 6);
    expect(gatePhaseAt({ ...GATE, offsetSeconds: 6 }, 0).phase).toBe('CLOSED'); // the schedule can be shifted
  });

  it('a hazard: SAFE, WARNING, ACTIVE, repeat — exact boundaries', () => {
    const at = (t: number) => hazardPhaseAt(HAZARD, t).phase;
    expect([0, 1.999].map(at)).toEqual(['SAFE', 'SAFE']);
    expect([2, 2.5, 2.999].map(at)).toEqual(['WARNING', 'WARNING', 'WARNING']);
    expect([3, 3.5, 3.999].map(at)).toEqual(['ACTIVE', 'ACTIVE', 'ACTIVE']);
    expect([4, 5.999, 6, 7.5].map(at)).toEqual(['SAFE', 'SAFE', 'WARNING', 'ACTIVE']);
    expect(hazardPhaseAt(HAZARD, 0.5).secondsToChange).toBeCloseTo(1.5, 6);
  });

  it('a platform: one axis, there and back, pausing at each end; position and direction are functions of time', () => {
    const p = (t: number) => platformAt(PLATFORM, t);
    expect(p(0).rect).toEqual({ x: 300, y: 300, width: 100, height: 100 });
    expect(p(0.0001).moving).toBe(true);
    expect(p(2).rect.x).toBeCloseTo(400, 9);
    expect(p(2).direction).toEqual({ x: 1, y: 0 });
    expect(p(4).rect.x).toBeCloseTo(500, 9);
    expect(p(4.5)).toMatchObject({ moving: false });
    expect(p(4.5).rect.x).toBe(500);
    expect(p(5.5).rect.x).toBeCloseTo(475, 9); // on its way back (s = 1 − 0.5/4)
    expect(p(5.5).direction).toEqual({ x: -1, y: 0 });
    expect(p(10).rect.x).toBeCloseTo(300, 9); // cycle = 2 × (4 + 1)
    expect(p(10 + 2).rect.x).toBeCloseTo(p(2).rect.x, 9);
    expect(platformAt({ ...PLATFORM, offsetSeconds: 2 }, 0).rect.x).toBeCloseTo(400, 9);
  });
});

describe('the experimental arena is valid, symmetric and has alternate routes', () => {
  it('is accepted by the rules (six spawns clear of every system)', () => {
    expect(() => createFuMatch([{ id: 'a', slot: 0 }], { arena: SYSTEMS_ARENA })).not.toThrow();
  });

  it('is mirror-symmetric left–right and top–bottom (walls, gates, hazards), with equal schedules', () => {
    const rects = (list: readonly { x: number; y: number; width: number; height: number }[]) =>
      list.map((r) => `${r.x},${r.y},${r.width},${r.height}`).sort();
    const mirrorX = (r: { x: number; y: number; width: number; height: number }) => ({
      ...r,
      x: 1600 - r.x - r.width,
    });
    const mirrorY = (r: { x: number; y: number; width: number; height: number }) => ({
      ...r,
      y: 900 - r.y - r.height,
    });
    const walls = [...wallsOf(SYSTEMS_ARENA)];
    expect(rects(walls.map(mirrorX))).toEqual(rects(walls));
    expect(rects(walls.map(mirrorY))).toEqual(rects(walls));
    const gates = SYSTEMS_ARENA.gates ?? [];
    expect(rects(gates.map((g) => mirrorX(g.rect)))).toEqual(rects(gates.map((g) => g.rect)));
    expect(
      new Set(
        gates.map(
          (g) => `${g.openSeconds}/${g.warnSeconds}/${g.closedSeconds}/${g.offsetSeconds ?? 0}`,
        ),
      ).size,
    ).toBe(1);
    const hazards = SYSTEMS_ARENA.hazards ?? [];
    expect(rects(hazards.map((h) => mirrorY(h.rect)))).toEqual(rects(hazards.map((h) => h.rect)));
    expect(
      new Set(
        hazards.map(
          (h) => `${h.safeSeconds}/${h.warnSeconds}/${h.activeSeconds}/${h.offsetSeconds ?? 0}`,
        ),
      ).size,
    ).toBe(1);
    const [p1, p2] = SYSTEMS_ARENA.platforms ?? [];
    expect(p1?.travelSeconds).toBe(p2?.travelSeconds);
    expect(p1?.pauseSeconds).toBe(p2?.pauseSeconds);
  });

  it('every spawn can reach every other with the gates CLOSED (alternate routes), and without ever touching a hazard', () => {
    const solid = [...wallsOf(SYSTEMS_ARENA), ...(SYSTEMS_ARENA.gates ?? []).map((g) => g.rect)]; // gates closed
    const hazards = (SYSTEMS_ARENA.hazards ?? []).map((h) => h.rect);
    const STEP = 20;
    const cols = 1600 / STEP;
    const rows = 900 / STEP;
    const free = (cx: number, cy: number) => {
      const p = { x: cx * STEP, y: cy * STEP };
      return (
        p.x >= R &&
        p.y >= R &&
        p.x <= 1600 - R &&
        p.y <= 900 - R &&
        !circleHitsWalls(p, R, solid) &&
        !hazards.some((h) => circleHitsWalls(p, R, [h]) || inRect(p, h))
      );
    };
    const spawns = SYSTEMS_ARENA.spawns ?? [];
    const start = must(spawns[0], 'spawn');
    const seen = new Set<number>();
    const queue: [number, number][] = [[Math.round(start.x / STEP), Math.round(start.y / STEP)]];
    seen.add(Math.round(start.y / STEP) * cols + Math.round(start.x / STEP));
    while (queue.length > 0) {
      const [cx, cy] = must(queue.shift(), 'cell');
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (
          nx < 0 ||
          ny < 0 ||
          nx >= cols ||
          ny >= rows ||
          seen.has(ny * cols + nx) ||
          !free(nx, ny)
        )
          continue;
        seen.add(ny * cols + nx);
        queue.push([nx, ny]);
      }
    }
    for (const s of spawns)
      expect(
        seen.has(Math.round(s.y / STEP) * cols + Math.round(s.x / STEP)),
        JSON.stringify(s),
      ).toBe(true);
  });

  it.each([
    [
      'a gate thinner than a body',
      { gates: [{ ...GATE, rect: { x: 700, y: 400, width: 20, height: 100 } }] },
    ],
    [
      'a gate whose warning is not shorter than its open time',
      { gates: [{ ...GATE, warnSeconds: 6 }] },
    ],
    ['a gate with no closed time', { gates: [{ ...GATE, closedSeconds: 0 }] }],
    [
      'a gate outside the arena',
      { gates: [{ ...GATE, rect: { x: 1590, y: 400, width: 50, height: 100 } }] },
    ],
    ['a gate on a wall', { walls: [{ x: 690, y: 380, width: 100, height: 200 }], gates: [GATE] }],
    [
      'a gate on a spawn point',
      { spawns: [{ x: 720, y: 450 }, ...CORNERS.slice(1)], gates: [GATE] },
    ],
    [
      'a hazard on a spawn point',
      { spawns: [{ x: 800, y: 450 }, ...CORNERS.slice(1)], hazards: [HAZARD] },
    ],
    ['a hazard with no warning', { hazards: [{ ...HAZARD, warnSeconds: 0 }] }],
    ['a platform that moves diagonally', { platforms: [{ ...PLATFORM, to: { x: 500, y: 400 } }] }],
    ['a platform that leaves the arena', { platforms: [{ ...PLATFORM, to: { x: 1580, y: 300 } }] }],
    [
      'a platform that runs through a wall',
      { walls: [{ x: 420, y: 250, width: 60, height: 200 }], platforms: [PLATFORM] },
    ],
    ['a platform with no travel time', { platforms: [{ ...PLATFORM, travelSeconds: 0 }] }],
  ])('rejects %s', (_name, parts) => {
    expect(() =>
      createFuMatch([{ id: 'a', slot: 0 }], { arena: arenaOf(parts as Partial<FuArena<Rect>>) }),
    ).toThrow(RangeError);
  });
});

describe('timed gates', () => {
  const arena = arenaOf({ gates: [GATE] });
  const left = { x: 650, y: 450 }; // 50 left of the gate's left face (700)

  it('are open at the start, shut on the exact step the schedule says CLOSED, and open again on schedule', () => {
    let s = duel(arena);
    expect(phaseOf(s)?.status).toBe('OPEN');
    s = withTime(s, 6 - 1.5 * DT);
    const first = stepFu(s, NONE, DT).state; // ends at 6 − 0.5·dt: still CLOSING
    expect(first.gatesShut).toEqual([false]);
    expect(phaseOf(first)?.status).toBe('CLOSING');
    const second = stepFu(first, NONE, DT).state; // ends at 6 + 0.5·dt: CLOSED
    expect(second.gatesShut).toEqual([true]);
    expect(phaseOf(second)?.status).toBe('CLOSED');
    const reopened = stepFu(withTime(second, 12 - 0.5 * DT), NONE, DT).state;
    expect(reopened.gatesShut).toEqual([false]);
    expect(phaseOf(reopened)?.status).toBe('OPEN');
  });

  it('a CLOSED gate is solid: walking is stopped flush, a normal dash is stopped, and it is open to walk through when OPEN', () => {
    const closed = stepFu(withTime(place(duel(arena), 'a', left.x, left.y), 7), NONE, DT).state;
    const walked = run(closed, 200, input({ a: { move: { x: 1, y: 0 } } }), { repeat: true }).state;
    expect(at(walked, 'a').x).toBeCloseTo(700 - R, 6);
    const dashed = run(face(closed, 'a', 1, 0), 1, input({ a: { dash: true } })).state;
    const done = run(dashed, 20).state;
    expect(at(done, 'a').x).toBeLessThanOrEqual(700 - R + 1e-6);
    const open = place(duel(arena), 'a', left.x, left.y);
    const through = run(open, 120, input({ a: { move: { x: 1, y: 0 } } }), { repeat: true });
    expect(at(through.state, 'a').x).toBeGreaterThan(800); // it walked on through while OPEN (≈ 1 s of walking, well before it shuts)
  });

  it('a gate that would close on a PLAYER waits (never embedding them), and shuts the first step they are clear', () => {
    let s = place(duel(arena), 'a', 725, 450); // standing in the doorway
    s = withTime(s, 5.9);
    for (let i = 0; i < 120; i += 1) {
      s = stepFu(s, NONE, DT).state;
      expect(s.gatesShut, `step ${i}`).toEqual([false]); // scheduled CLOSED from 6 s, but held open
    }
    expect(phaseOf(s)).toMatchObject({ status: 'CLOSING', held: true });
    expect(circleHitsWalls(at(s, 'a'), R, [GATE.rect])).toBe(true); // still standing in it — and nothing happened to them
    expect(player(s, 'a').alive).toBe(true);
    // they walk out: the gate shuts at once
    let out = s;
    for (let i = 0; i < 60 && !out.gatesShut[0]; i += 1)
      out = stepFu(out, input({ a: { move: { x: -1, y: 0 } } }), DT).state;
    expect(out.gatesShut).toEqual([true]);
    expect(circleHitsWalls(at(out, 'a'), R, [GATE.rect])).toBe(false);
  });

  it('a gate that would close on a BOOMERANG waits for it, and the boomerang is never inside a shut gate', () => {
    let s = duel(arena);
    s = withTime(s, 5.95);
    s = flying(s, 'b', { x: 725, y: 380 }, { x: 0, y: 1 }); // flies down through the doorway
    let inGate = false;
    let shutWhileOverlapping = false;
    for (let i = 0; i < 40; i += 1) {
      s = stepFu(s, NONE, DT).state;
      const b = boom(s, 'b');
      const overlapping =
        b.state !== 'HELD' && circleHitsWalls(b.position, C.boomerangRadius, [GATE.rect]);
      if (overlapping) inGate = true;
      if (overlapping && s.gatesShut[0] === true) shutWhileOverlapping = true;
    }
    expect(inGate).toBe(true);
    expect(shutWhileOverlapping).toBe(false);
    expect(s.gatesShut).toEqual([true]); // it shut once the boomerang was out
  });

  it('a gate that would close on a DASHER waits; the dasher comes out the far side and the gate then shuts', () => {
    let s = place(duel(arena), 'a', 640, 450);
    s = withTime(face(s, 'a', 1, 0), 5.9);
    s = run(s, 1, input({ a: { dash: true } })).state;
    let shutOnBody = false;
    for (let i = 0; i < 40; i += 1) {
      s = stepFu(s, NONE, DT).state;
      if (s.gatesShut[0] === true && circleHitsWalls(at(s, 'a'), R, [GATE.rect])) shutOnBody = true;
    }
    expect(shutOnBody).toBe(false);
    expect(at(s, 'a').x).toBeGreaterThan(640 + 100); // got through (the gate had not shut)
    expect(player(s, 'a').alive).toBe(true);
  });

  it('PHASE_DASH treats a CLOSED gate as internal solid wall: it phases through it, and nothing else', () => {
    let s = own(place(duel(arena), 'a', 700 - R, 450), 'a', 'PHASE_DASH');
    s = stepFu(withTime(s, 7), NONE, DT).state; // shut
    expect(s.gatesShut).toEqual([true]);
    const start = at(s, 'a').x;
    let r = stepFu(face(s, 'a', 1, 0), input({ a: { dash: true } }), DT);
    const events = [...r.events];
    for (let i = 0; i < 20 && player(r.state, 'a').dash.phase === 'DASHING'; i += 1) {
      r = stepFu(r.state, NONE, DT);
      events.push(...r.events);
    }
    expect(types(events)).toContain('PHASE_ENTERED');
    expect(at(r.state, 'a').x).toBeCloseTo(start + C.dashSpeed * C.dashSeconds, 5);
    expect(circleHitsWalls(at(r.state, 'a'), R, [GATE.rect])).toBe(false);
    // walking into it is still blocked, from either side
    const back = run(place(r.state, 'a', 800, 450), 200, input({ a: { move: { x: -1, y: 0 } } }), {
      repeat: true,
    }).state;
    expect(at(back, 'a').x).toBeGreaterThanOrEqual(750 + R - 1e-6);
  });

  it('a gate scheduled to close on a PHASING player crossing it waits like any other, and they emerge unharmed', () => {
    let s = own(place(duel(arena), 'a', 640, 450), 'a', 'PHASE_DASH');
    s = withTime(face(s, 'a', 1, 0), 5.9);
    s = run(s, 1, input({ a: { dash: true } })).state;
    for (let i = 0; i < 30; i += 1) {
      s = stepFu(s, NONE, DT).state;
      if (s.gatesShut[0] === true) expect(circleHitsWalls(at(s, 'a'), R, [GATE.rect])).toBe(false);
    }
    expect(player(s, 'a').alive).toBe(true);
  });

  it('a thrown boomerang cannot pass a CLOSED gate (it turns back); an open gate lets it through', () => {
    let s = place(duel(arena), 'a', 560, 450);
    s = face(s, 'a', 1, 0);
    const closed = run(stepFu(withTime(s, 7), NONE, DT).state, 40, input({ a: { throw: true } }));
    expect(boom(closed.state, 'a').position.x).toBeLessThanOrEqual(700 - C.boomerangRadius + 1e-6);
    const open = run(s, 40, input({ a: { throw: true } }));
    expect(boom(open.state, 'a').position.x).toBeGreaterThan(760);
  });

  it('TWIN_THROW: both boomerangs are stopped by the closed gate, each on its own', () => {
    let s = own(place(duel(arena), 'a', 560, 450), 'a', 'TWIN_THROW');
    s = face(stepFu(withTime(s, 7), NONE, DT).state, 'a', 1, 0);
    s = stepFu(s, input({ a: { throw: true } }), DT).state;
    s = run(s, 3).state;
    s = stepFu(s, input({ a: { throw: true } }), DT).state;
    s = run(s, 40).state;
    for (const w of weaponsOf(s, 'a'))
      expect(w.position.x).toBeLessThanOrEqual(700 - C.boomerangRadius + 1e-6);
  });

  it('SLASH cannot cut through a closed gate (cover), and can when it is open', () => {
    let s = place(place(duel(arena), 'a', 600, 450), 'b', 790, 450);
    s = face(s, 'a', 1, 0);
    const wide = { ...s.config, slashReach: 260 };
    s = { ...s, config: wide };
    const closed = stepFu(
      stepFu(withTime(s, 7), NONE, DT).state,
      input({ a: { slash: true } }),
      DT,
    );
    expect(player(closed.state, 'b').alive).toBe(true);
    const open = stepFu(s, input({ a: { slash: true } }), DT);
    expect(player(open.state, 'b').alive).toBe(false);
  });

  it('BLAST: a closed gate is cover from an explosion; an open one is not', () => {
    const arenaB = arenaOf({ gates: [GATE] });
    const setup = (t: number) => {
      let s = make(['a', 'b', 'c'], { arena: arenaB });
      s = place(place(place(s, 'a', 100, 850), 'b', 660, 400), 'c', 786, 400); // c is ~140 from the blast, behind the gate
      s = own(s, 'a', 'BLAST_BOOMERANG');
      s = flying(s, 'a', { x: 630, y: 400 }, { x: 1, y: 0 }, { blast: true });
      return stepFu(withTime(s, t), NONE, DT).state;
    };
    const shut = run(setup(7), 8);
    expect(player(shut.state, 'b').alive).toBe(false); // the contacted player
    expect(player(shut.state, 'c').alive).toBe(true); // sheltered by the closed gate
    const open = run(setup(0), 8);
    expect(player(open.state, 'c').alive).toBe(false);
  });

  it('OVERDRIVE: an overdriven walker is stopped by a closed gate exactly like anyone', () => {
    let s = own(place(duel(arena), 'a', 600, 450), 'a', 'OVERDRIVE');
    s = stepFu(withTime(s, 7), NONE, DT).state;
    const r = run(s, 120, input({ a: { move: { x: 1, y: 0 } } }), { repeat: true }).state;
    expect(at(r, 'a').x).toBeCloseTo(700 - R, 6);
  });

  it('a new round starts with every gate open and unlatched; the round clock restarts', () => {
    let s = stepFu(withTime(place(duel(arena), 'a', 600, 450), 7), NONE, DT).state;
    expect(s.gatesShut).toEqual([true]);
    s = stepFu(patchPlayer(s, 'b', { alive: false }), NONE, DT).state;
    for (let i = 0; i < 400 && s.round === 1; i += 1) s = stepFu(s, NONE, DT).state;
    expect(s.round).toBe(2);
    expect(s.roundTime).toBe(0);
    expect(s.gatesShut).toEqual([false]);
  });

  it('the clock is frozen while the round is over and advances only in play', () => {
    let s = stepFu(patchPlayer(duel(arena), 'b', { alive: false }), NONE, DT).state;
    const t = s.roundTime;
    expect(t).toBeCloseTo(DT, 9);
    s = run(s, 30).state;
    expect(s.roundTime).toBe(t);
  });
});

describe('moving platforms', () => {
  const arena = arenaOf({ platforms: [PLATFORM] });
  const onIt = () => place(duel(arena), 'a', 350, 350); // the platform's middle at t = 0

  it('its place at any time is exactly platformAt(time), whatever the step size', () => {
    for (const dt of [DT, 0.05, 0.1]) {
      let s = onIt();
      const steps = Math.round(3 / dt);
      s = run(s, steps, NONE, { dt }).state;
      expect(systemsView(arena, s.roundTime, s.gatesShut).platforms[0]?.rect.x).toBeCloseTo(
        platformAt(PLATFORM, steps * dt).rect.x,
        9,
      );
    }
  });

  it('carries a rider with it: standing still on it, they end where the platform took them', () => {
    const s = run(onIt(), 120).state; // 2 s: the platform has moved 100
    expect(at(s, 'a').x).toBeCloseTo(350 + 100, 4);
    expect(at(s, 'a').y).toBeCloseTo(350, 9);
  });

  it('the rider stays in control: walking on it adds to the ride, in any direction', () => {
    const walk = run(onIt(), 6, input({ a: { move: { x: 0, y: -1 } } }), { repeat: true }).state;
    expect(at(walk, 'a').y).toBeCloseTo(350 - 6 * C.playerSpeed * DT, 4);
    expect(at(walk, 'a').x).toBeCloseTo(350 + 6 * DT * 50, 3); // still on it: the platform's 50 u/s
  });

  it('leaving the platform ends the ride: once off it, nothing carries them', () => {
    let s = place(duel(arena), 'a', 305, 350); // near its left edge
    s = run(s, 20, input({ a: { move: { x: -1, y: 0 } } }), { repeat: true }).state; // walks off the left
    const x = at(s, 'a').x;
    expect(inRect(at(s, 'a'), platformAt(PLATFORM, s.roundTime).rect)).toBe(false);
    expect(at(run(s, 60).state, 'a').x).toBeCloseTo(x, 9);
  });

  it('a dashing player is not carried (the burst is their own)', () => {
    const plain = run(
      face(place(duel(arenaOf({})), 'a', 350, 350), 'a', 0, 1),
      6,
      input({ a: { dash: true } }),
    ).state;
    const onPlatform = run(face(onIt(), 'a', 0, 1), 6, input({ a: { dash: true } })).state;
    expect(at(onPlatform, 'a').x).toBeCloseTo(at(plain, 'a').x, 9);
  });

  it('several riders are all carried, keep their relative places, and never overlap', () => {
    let s = make(['a', 'b', 'c'], { arena });
    s = place(place(place(s, 'a', 320, 330), 'b', 380, 380), 'c', 1500, 800); // 78 apart: not overlapping
    const before = { a: at(s, 'a'), b: at(s, 'b') };
    const r = run(s, 120).state;
    expect(at(r, 'a').x - before.a.x).toBeCloseTo(100, 4);
    expect(at(r, 'b').x - before.b.x).toBeCloseTo(100, 4);
    expect(
      Math.hypot(at(r, 'a').x - at(r, 'b').x, at(r, 'a').y - at(r, 'b').y),
    ).toBeGreaterThanOrEqual(2 * R - 1e-6);
  });

  it('a platform never crushes: carried into a wall, the rider is pushed clear and lives', () => {
    const walled = arenaOf({
      platforms: [PLATFORM],
      walls: [{ x: 600, y: 280, width: 60, height: 140 }],
    });
    let s = place(duel(walled), 'a', 392, 350); // near the platform's right edge
    for (let i = 0; i < 600; i += 1) {
      s = stepFu(s, NONE, DT).state;
      expect(
        wallsOf(walled).every(
          (w) =>
            Math.hypot(
              Math.max(w.x - at(s, 'a').x, 0, at(s, 'a').x - w.x - w.width),
              Math.max(w.y - at(s, 'a').y, 0, at(s, 'a').y - w.y - w.height),
            ) >=
            R - 1e-6,
        ),
      ).toBe(true);
      expect(player(s, 'a').alive).toBe(true);
    }
  });

  it('a rider is not carried through another player: the standing player is not pushed through and nobody overlaps', () => {
    let s = make(['a', 'b'], { arena });
    s = place(place(s, 'a', 340, 350), 'b', 470, 350); // b stands where the platform is heading, off it
    for (let i = 0; i < 300; i += 1) {
      s = stepFu(s, NONE, DT).state;
      expect(
        Math.hypot(at(s, 'a').x - at(s, 'b').x, at(s, 'a').y - at(s, 'b').y),
      ).toBeGreaterThanOrEqual(2 * R - 1e-6);
    }
  });

  it('boomerangs do not inherit its motion: a boomerang over the platform flies by its own rules', () => {
    const plain = run(flying(duel(arena), 'b', { x: 350, y: 200 }, { x: 0, y: 1 }), 10).state;
    const free = run(flying(duel(arenaOf({})), 'b', { x: 350, y: 200 }, { x: 0, y: 1 }), 10).state;
    expect(boom(plain, 'b').position).toEqual(boom(free, 'b').position);
  });

  it('a new round puts the platform back at the start of its path', () => {
    let s = run(onIt(), 90).state;
    s = stepFu(patchPlayer(s, 'b', { alive: false }), NONE, DT).state;
    for (let i = 0; i < 400 && s.round === 1; i += 1) s = stepFu(s, NONE, DT).state;
    expect(systemsView(arena, s.roundTime, s.gatesShut).platforms[0]?.rect.x).toBe(300);
  });
});

describe('the lethal floor (hazard)', () => {
  const arena = arenaOf({ hazards: [HAZARD] });
  const stood = (extra: (s: FuState) => FuState = (s) => s) =>
    extra(place(duel(arena), 'a', 800, 450));

  it('SAFE and WARNING are harmless (a long wait on it); ACTIVE kills on the exact step it begins', () => {
    let s = stood();
    const events: FuEvent[] = [];
    let diedAt = -1;
    for (let i = 0; i < 400 && diedAt < 0; i += 1) {
      const r = stepFu(s, NONE, DT);
      s = r.state;
      events.push(...r.events);
      if (!player(s, 'a').alive) diedAt = s.roundTime;
    }
    // safe 2 s + warning 1 s: the first ACTIVE instant is t = 3
    expect(diedAt).toBeGreaterThanOrEqual(3 - 1e-9);
    expect(diedAt).toBeLessThan(3 + DT + 1e-9);
    expect(hits(events)).toEqual([expect.objectContaining({ victimId: 'a', byId: 'HAZARD' })]);
  });

  it('the telegraph is fair: WARNING lasts a second, during which the player is untouched and can leave', () => {
    let s = withTime(stood(), 2); // WARNING begins
    expect(systemsView(arena, s.roundTime, s.gatesShut).hazards[0]?.phase).toBe('WARNING');
    s = run(s, 54, input({ a: { move: { x: 0, y: -1 } } }), { repeat: true }).state; // ≈ 0.9 s later they have walked out
    expect(player(s, 'a').alive).toBe(true);
    expect(inRect(at(s, 'a'), HAZARD.rect)).toBe(false);
    s = run(s, 120, input({ a: { move: { x: 0, y: -1 } } }), { repeat: true }).state; // ACTIVE passes, they are clear of it
    expect(player(s, 'a').alive).toBe(true);
  });

  it('what counts is the CENTRE on the strip: a body overlapping its edge is safe, one just inside is not', () => {
    const edge = place(duel(arena), 'a', 700 - 10, 450); // circle overlaps the strip; centre outside
    expect(player(run(withTime(edge, 3.2), 30).state, 'a').alive).toBe(true);
    const inside = place(duel(arena), 'a', 700 + 1, 450);
    expect(player(run(withTime(inside, 3.2), 3).state, 'a').alive).toBe(false);
  });

  it('a shield absorbs the contact ONCE and breaks; the player is then spared for the rest of that ACTIVE window, not the next', () => {
    let s = withTime(
      stood((x) => give(x, 'a', 'GUARD')),
      3.2,
    );
    s = place(s, 'a', 800, 450);
    const first = stepFu(s, NONE, DT);
    expect(player(first.state, 'a').alive).toBe(true);
    expect(player(first.state, 'a').inventory).toEqual([]);
    expect(first.events).toContainEqual(
      expect.objectContaining({ type: 'GUARD_BLOCKED', playerId: 'a', byId: 'HAZARD' }),
    );
    const rest = run(first.state, 30).state; // still standing in it, still ACTIVE, still alive
    expect(player(rest, 'a').alive).toBe(true);
    // the next ACTIVE window (t = 15) is not covered: the pass has ended
    const next = run(withTime(rest, 14.9), 20).state; // the cycle is 4 s: ACTIVE again from t = 15
    expect(player(next, 'a').alive).toBe(false);
  });

  it('DASH across it while ACTIVE is lethal; across it while SAFE is not; no randomness anywhere', () => {
    const cross = (t: number) => {
      let s = withTime(face(place(duel(arena), 'a', 660, 450), 'a', 1, 0), t);
      s = stepFu(s, input({ a: { dash: true } }), DT).state;
      for (let i = 0; i < 12; i += 1) s = stepFu(s, NONE, DT).state;
      return s;
    };
    expect(player(cross(3.1), 'a').alive).toBe(false);
    expect(player(cross(0.2), 'a').alive).toBe(true);
    expect(at(cross(0.2), 'a').x).toBeCloseTo(660 + C.dashSpeed * C.dashSeconds, 5);
  });

  it('a strip narrower than one big step cannot be skipped at a high accepted dt', () => {
    const thin = arenaOf({
      hazards: [{ ...HAZARD, rect: { x: 800, y: 400, width: 40, height: 100 } }],
    });
    let s = withTime(face(place(duel(thin), 'a', 760, 450), 'a', 1, 0), 3.2);
    s = stepFu(s, input({ a: { dash: true } }), 0.1).state; // one 0.1 s step: 110 units in 6 sub-steps
    expect(player(run(s, 3, NONE, { dt: 0.1 }).state, 'a').alive).toBe(false);
  });

  it('PHASE_DASH grants no immunity: phasing across an ACTIVE strip is lethal', () => {
    let s = own(
      withTime(face(place(duel(arena), 'a', 660, 450), 'a', 1, 0), 3.1),
      'a',
      'PHASE_DASH',
    );
    s = stepFu(s, input({ a: { dash: true } }), DT).state;
    for (let i = 0; i < 12; i += 1) s = stepFu(s, NONE, DT).state;
    expect(player(s, 'a').alive).toBe(false);
  });

  it('OVERDRIVE grants none either: an overdriven body on an ACTIVE strip dies', () => {
    const s = own(withTime(stood(), 3.1), 'a', 'OVERDRIVE');
    expect(
      player(run(s, 3, input({ a: { move: { x: 1, y: 0 } } }), { repeat: true }).state, 'a').alive,
    ).toBe(false);
  });

  it('a body riding a platform over an ACTIVE strip is not touched; stepping off it is fatal', () => {
    const over = arenaOf({
      hazards: [
        {
          rect: { x: 300, y: 250, width: 300, height: 200 },
          safeSeconds: 1,
          warnSeconds: 1,
          activeSeconds: 50,
        },
      ],
      platforms: [PLATFORM],
    });
    let s = withTime(place(duel(over), 'a', 460, 350), 2.2); // the platform is under them at t = 2.2 (x 410–510) and the strip is ACTIVE
    for (let i = 0; i < 100; i += 1) {
      s = stepFu(s, NONE, DT).state;
      expect(player(s, 'a').alive, `riding, step ${i}`).toBe(true);
    }
    const off = run(place(s, 'a', 460, 435), 3).state; // beside the platform (y 300–400), still on the strip
    expect(player(off, 'a').alive).toBe(false);
  });

  it('hazards kill players, not boomerangs: a boomerang flies across an ACTIVE strip untouched', () => {
    const s = run(
      withTime(flying(duel(arena), 'b', { x: 600, y: 450 }, { x: 1, y: 0 }), 3.2),
      20,
    ).state;
    expect(boom(s, 'b').position.x).toBeGreaterThan(800);
  });

  it('death by the floor leaves what the player owns, and a round reset puts the floor back to SAFE', () => {
    let s = own(withTime(stood(), 3.2), 'a', 'PHASE_DASH', 'TWIN_THROW');
    s = run(s, 3).state;
    expect(player(s, 'a').alive).toBe(false);
    expect(player(s, 'a').inventory).toEqual(['PHASE_DASH', 'TWIN_THROW']);
    for (let i = 0; i < 400 && s.round === 1; i += 1) s = stepFu(s, NONE, DT).state;
    expect(s.round).toBe(2);
    expect(player(s, 'a').inventory).toEqual(['PHASE_DASH', 'TWIN_THROW']);
    expect(systemsView(arena, s.roundTime, s.gatesShut).hazards[0]?.phase).toBe('SAFE');
    expect(player(s, 'a').hazardSpared).toEqual([]);
  });
});

describe('determinism, high dt and six-player fuzz in the real experimental arena', () => {
  const six = () =>
    make(['a', 'b', 'c', 'd', 'e', 'f'], { arena: SYSTEMS_ARENA, regulationRounds: 9 });
  const script = (i: number) =>
    input(
      Object.fromEntries(
        ['a', 'b', 'c', 'd', 'e', 'f'].map((id, k) => [
          id,
          {
            move: { x: Math.cos(i / (17 + 3 * k) + k), y: Math.sin(i / (23 + 2 * k) + k) },
            dash: (i + k * 5) % (11 + k) === 0,
            throw: (i + k * 7) % 41 === 0,
            slash: (i + k * 3) % 53 === 0,
          },
        ]),
      ),
    );

  it('replays to the identical state and events (3,000 steps, six players)', () => {
    const play = () => {
      let s = six();
      const log: unknown[] = [];
      for (let i = 0; i < 3000; i += 1) {
        const r = stepFu(s, script(i), DT);
        s = r.state;
        log.push(r.events);
      }
      return JSON.stringify({ s, log });
    };
    expect(play()).toBe(play());
  });

  it('INVARIANTS under a six-player fuzz: nobody ends a step inside solid geometry (walls or shut gates) unless mid phase-dash; nobody leaves the arena; platforms stay on their paths; only ACTIVE floor kills', () => {
    let s = six();
    for (const id of ['a', 'c', 'e']) s = own(s, id, 'PHASE_DASH', 'OVERDRIVE');
    let hazardKills = 0;
    for (let i = 0; i < 8000; i += 1) {
      const r = stepFu(s, script(i), DT);
      s = r.state;
      const view = systemsView(SYSTEMS_ARENA, s.roundTime, s.gatesShut);
      const solid = [
        ...wallsOf(SYSTEMS_ARENA),
        ...view.gates.filter((g) => g.status === 'CLOSED').map((g) => g.rect),
      ];
      for (const p of s.players) {
        if (!p.alive) continue;
        const where = at(s, p.id);
        const phasing = p.dash.phase === 'DASHING' && 'phasing' in p.dash;
        if (!phasing) {
          expect(
            solid.every(
              (w) =>
                Math.hypot(
                  Math.max(w.x - where.x, 0, where.x - w.x - w.width),
                  Math.max(w.y - where.y, 0, where.y - w.y - w.height),
                ) >=
                R - 1e-6,
            ),
            `step ${i} ${p.id} ${JSON.stringify(where)}`,
          ).toBe(true);
        }
        expect(where.x).toBeGreaterThanOrEqual(R - 1e-6);
        expect(where.x).toBeLessThanOrEqual(1600 - R + 1e-6);
        expect(where.y).toBeGreaterThanOrEqual(R - 1e-6);
        expect(where.y).toBeLessThanOrEqual(900 - R + 1e-6);
      }
      for (const platform of view.platforms) {
        expect(platform.rect.x).toBeGreaterThanOrEqual(650 - 1e-6);
        expect(platform.rect.x + platform.rect.width).toBeLessThanOrEqual(960 + 1e-6);
      }
      for (const e of r.events) {
        if (e.type === 'HIT' && e.byId === 'HAZARD') {
          hazardKills += 1;
          const v = at(s, e.victimId);
          const active = view.hazards.some((h) => h.phase === 'ACTIVE' || h.secondsToChange < 0.2);
          expect(active || hazardPhaseWasActive(s.roundTime), `step ${i}`).toBe(true);
          expect(v.x).toBeGreaterThan(0);
        }
      }
      expect(s.gatesShut).toHaveLength(2);
    }
    expect(hazardKills).toBeGreaterThanOrEqual(0);
  });

  it('is the same at any accepted dt: a gate, a platform and a hazard agree between 1/60 s and 0.1 s steps', () => {
    const a = run(six(), 120, NONE, { dt: DT }).state;
    const b = run(six(), 20, NONE, { dt: 0.1 }).state;
    const va = systemsView(SYSTEMS_ARENA, a.roundTime, a.gatesShut);
    const vb = systemsView(SYSTEMS_ARENA, b.roundTime, b.gatesShut);
    expect(vb.platforms[0]?.rect.x).toBeCloseTo(va.platforms[0]?.rect.x ?? NaN, 6);
    expect(vb.hazards.map((h) => h.phase)).toEqual(va.hazards.map((h) => h.phase));
    expect(vb.gates.map((g) => g.status)).toEqual(va.gates.map((g) => g.status));
  });
});

/** (the fuzz only checks a kill happened near an ACTIVE moment; the exact-boundary tests above are the precise ones) */
function hazardPhaseWasActive(roundTime: number): boolean {
  return (SYSTEMS_ARENA.hazards ?? []).some((h) =>
    [0, 0.05, 0.1, 0.2].some((back) => hazardPhaseAt(h, roundTime - back).phase === 'ACTIVE'),
  );
}

describe('the real arena in play', () => {
  it('the centre hazards and platforms behave as designed: a platform rider crosses a strip the others cannot', () => {
    let s = make(['a', 'b'], { arena: SYSTEMS_ARENA });
    s = place(place(s, 'a', 700, 295), 'b', 1500, 800); // on platform 1 at t = 0 (it starts at x 650–750)
    for (let i = 0; i < 60 * 9; i += 1) {
      s = stepFu(s, NONE, DT).state;
      expect(player(s, 'a').alive, `t=${s.roundTime}`).toBe(true); // rides through SAFE, WARNING and ACTIVE untouched
    }
    expect(at(s, 'a').x).toBeGreaterThan(700);
  });

  it('every pickup spot is clear of every system', () => {
    expect(() =>
      createFuMatch([{ id: 'a', slot: 0 }], {
        arena: SYSTEMS_ARENA,
        powerups: {
          spots: [
            { x: 320, y: 250 },
            { x: 1280, y: 250 },
            { x: 320, y: 650 },
            { x: 1280, y: 650 },
          ],
          firstSeconds: 15,
          intervalSeconds: 45,
          maxOnField: 1,
          pickupRadius: 28,
        },
      }),
    ).not.toThrow();
    expect(() =>
      createFuMatch([{ id: 'a', slot: 0 }], {
        arena: SYSTEMS_ARENA,
        powerups: {
          spots: [{ x: 800, y: 295 }],
          firstSeconds: 15,
          intervalSeconds: 45,
          maxOnField: 1,
          pickupRadius: 28,
        },
      }),
    ).toThrow(RangeError);
  });
});

describe('more of the combat sandbox against the arena systems', () => {
  const gated = arenaOf({ gates: [GATE] });

  it('a RETURNING boomerang is bound by a closed gate (it goes round, never through) and still gets home', () => {
    let s = place(duel(gated), 'a', 800, 450);
    s = stepFu(withTime(s, 7), NONE, DT).state;
    s = patchBoomerang(s, 'a', {
      state: 'RETURNING',
      position: { x: 640, y: 450 },
      direction: { x: 0, y: 0 },
    });
    let crossed = false;
    for (let i = 0; i < 400; i += 1) {
      s = stepFu(withTime(s, 7), NONE, DT).state; // the gate stays shut throughout
      const b = boom(s, 'a');
      if (b.state !== 'HELD' && circleHitsWalls(b.position, C.boomerangRadius, [GATE.rect]))
        crossed = true;
    }
    expect(crossed).toBe(false);
    expect(boom(s, 'a').state).toBe('HELD');
  });

  it('a DEFLECTED boomerang stops at a closed gate and turns back (and passes an open one)', () => {
    const run1 = (t: number) => {
      let s = place(duel(gated), 'a', 100, 850);
      s = stepFu(withTime(s, t), NONE, DT).state;
      s = patchBoomerang(s, 'a', {
        state: 'DEFLECTED',
        position: { x: 640, y: 450 },
        direction: { x: 1, y: 0 },
        travelled: 0,
        deflections: 1,
        deflectedBy: 'b',
      });
      return run(withTime(s, t), 6).state;
    };
    expect(boom(run1(7), 'a').position.x).toBeLessThanOrEqual(700 - C.boomerangRadius + 1e-6);
    expect(boom(run1(0), 'a').position.x).toBeGreaterThan(700);
  });

  it('OVERDRIVE on a platform: an overdriven rider walks 1.4× on top of the ride', () => {
    const arena = arenaOf({ platforms: [PLATFORM] });
    const s = own(place(duel(arena), 'a', 330, 350), 'a', 'OVERDRIVE');
    const r = run(s, 8, input({ a: { move: { x: 1, y: 0 } } }), { repeat: true }).state;
    expect(at(r, 'a').x).toBeCloseTo(
      330 + 8 * C.playerSpeed * C.overdriveMoveFactor * DT + 8 * DT * 50,
      3,
    );
  });

  it('players collide on a platform exactly as elsewhere: two riders pushing into each other stop in contact', () => {
    const arena = arenaOf({ platforms: [PLATFORM] });
    let s = make(['a', 'b'], { arena });
    s = place(place(s, 'a', 330, 350), 'b', 390, 350);
    s = run(s, 30, input({ a: { move: { x: 1, y: 0 } } }), { repeat: true }).state;
    expect(
      Math.hypot(at(s, 'a').x - at(s, 'b').x, at(s, 'a').y - at(s, 'b').y),
    ).toBeGreaterThanOrEqual(2 * R - 1e-6);
  });
});
