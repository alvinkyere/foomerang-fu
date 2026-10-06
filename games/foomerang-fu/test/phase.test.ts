import { describe, expect, it } from 'vitest';
import { PRIMITIVE_ARENA, stepFu } from '../src/rules';
import { circleHitsWalls, distanceToRect, wallsOf } from '../src/rules/arena';
import { lastValidAlong, planPhaseDash } from '../src/rules/phase';
import {
  C,
  DT,
  NONE,
  R,
  at,
  boom,
  flying,
  give,
  input,
  make,
  patchBoomerang,
  patchPlayer,
  patchPowers,
  place,
  player,
  run,
  types,
  type FuEvent,
  type FuState,
} from './support/fixtures';

// PHASE_DASH — CONSUMED ON USE. Walls stay solid. It changes ONE thing: while the owner is actively
// DASHING, their body may cross internal walls. Every other rule (walking, SLASH line of sight,
// boomerangs, the arena boundary, living players, vulnerability, fatigue) is unchanged.
//
// The traversal is a straight line, planned when the dash starts: the dash may go as far as
//   min(its length, the arena boundary, the first living player in the way)
// and if that endpoint would leave the player inside a wall, the dash stops at the LAST VALID place
// along that same line (flush before the wall, or in the gap between two walls). It is never an
// arbitrary teleport and never leaves anyone embedded. One charge is spent when the dash actually
// ENTERS a wall.

const WALLS = wallsOf(PRIMITIVE_ARENA);
const FULL = C.dashSpeed * C.dashSeconds; // 176
const FATIGUED_LENGTH = FULL * C.fatiguedDashFactor; // 123.2
const BOOSTED = FULL * C.overdriveDashFactor; // 228.8
const valid = (p: { x: number; y: number }) => !circleHitsWalls(p, R, WALLS);
const validWithin = (p: { x: number; y: number }) =>
  WALLS.every((w) => distanceToRect(p, w) >= R - 1e-6);

describe('planning (pure)', () => {
  const none: never[] = [];
  const arena = { width: 1600, height: 900 };

  it('open ground: the whole length', () => {
    expect(planPhaseDash({ x: 800, y: 100 }, { x: 1, y: 0 }, 100, R, [], arena, none)).toBe(100);
  });

  it('the arena boundary is a hard stop (it is never phaseable), on a straight line', () => {
    expect(planPhaseDash({ x: 110, y: 450 }, { x: -1, y: 0 }, 176, R, [], arena, none)).toBeCloseTo(
      74,
      9,
    );
    const d = Math.SQRT1_2;
    expect(
      planPhaseDash({ x: 110, y: 110 }, { x: -d, y: -d }, 176, R, [], arena, none),
    ).toBeCloseTo(74 / d, 9);
    expect(planPhaseDash({ x: 1500, y: 800 }, { x: 1, y: 0 }, 176, R, [], arena, none)).toBeCloseTo(
      64,
      9,
    );
  });

  it('a living player in the way stops it at contact — the dash never passes through a body', () => {
    const blocker = [{ position: { x: 400, y: 450 }, radius: R }];
    expect(
      planPhaseDash({ x: 300, y: 450 }, { x: 1, y: 0 }, 176, R, [], arena, blocker),
    ).toBeCloseTo(28, 9);
  });

  it('crossing a wall: the full length when the far side is clear, even though the middle is inside the wall', () => {
    expect(
      planPhaseDash({ x: 130, y: 450 }, { x: 1, y: 0 }, 176, R, WALLS, arena, none),
    ).toBeCloseTo(176, 9);
  });

  it('too short to cross: it stops flush before the wall (last valid place on the line)', () => {
    const t = planPhaseDash(
      { x: 130, y: 450 },
      { x: 1, y: 0 },
      FATIGUED_LENGTH,
      R,
      WALLS,
      arena,
      none,
    );
    expect(130 + t).toBeCloseTo(200 - R, 6);
  });

  it('lastValidAlong never returns an invalid place, and a valid endpoint is returned as is', () => {
    expect(lastValidAlong({ x: 130, y: 450 }, { x: 1, y: 0 }, 100, R, WALLS)).toBeCloseTo(34, 6);
    expect(lastValidAlong({ x: 130, y: 450 }, { x: 1, y: 0 }, 10, R, WALLS)).toBe(10);
    // standing in a wall with nothing valid behind: stay where you started (t = 0)
    expect(lastValidAlong({ x: 225, y: 450 }, { x: 1, y: 0 }, 50, R, WALLS)).toBe(0);
  });
});

/** Alice at `start` in the primitive arena with `charges` Phase Dashes; Bob in the far corner. */
function arenaWith(
  start: { x: number; y: number },
  charges = 2,
  extra: (s: FuState) => FuState = (s) => s,
): FuState {
  let s = make(['a', 'b'], { arena: PRIMITIVE_ARENA });
  s = place(place(s, 'a', start.x, start.y), 'b', 1500, 850);
  s = patchPowers(s, 'a', { phase: charges });
  return extra(s);
}

/** Presses DASH along `dir` and follows the whole dash. */
function dashFrom(
  s: FuState,
  dir: { x: number; y: number },
  dt = DT,
): { state: FuState; trail: { x: number; y: number }[]; events: FuEvent[] } {
  const trail: { x: number; y: number }[] = [];
  const events: FuEvent[] = [];
  let r = stepFu(s, input({ a: { dash: true, move: dir } }), dt);
  let state = r.state;
  events.push(...r.events);
  trail.push(at(state, 'a'));
  for (let i = 0; i < 60 && player(state, 'a').dash.phase === 'DASHING'; i += 1) {
    r = stepFu(state, NONE, dt);
    state = r.state;
    events.push(...r.events);
    trail.push(at(state, 'a'));
  }
  return { state, trail, events };
}
const RIGHT = { x: 1, y: 0 };
const embedded = (trail: { x: number; y: number }[]) => trail.some((p) => !valid(p));

describe('walls are solid for everything else', () => {
  it('walking cannot cross a wall, with or without the power, however long you push', () => {
    const s = arenaWith({ x: 130, y: 450 });
    const walked = run(s, 300, input({ a: { move: RIGHT } }), { repeat: true }).state;
    expect(at(walked, 'a').x).toBeCloseTo(200 - R, 6);
  });

  it('a normal dash (no power) is stopped flush by the wall', () => {
    const { state } = dashFrom(arenaWith({ x: 130, y: 450 }, 0), RIGHT);
    expect(at(state, 'a').x).toBeCloseTo(200 - R, 6);
  });

  it('SLASH through a wall is blocked as ever, power or no power', () => {
    let s = arenaWith({ x: 164, y: 450 });
    s = place(s, 'b', 290, 450); // 126 away, in the corridor behind the 50-thick wall: inside the 130 reach
    s = patchPlayer(s, 'a', { facing: RIGHT });
    const r = stepFu(s, input({ a: { slash: true } }), DT);
    expect(player(r.state, 'b').alive).toBe(true);
  });

  it('a boomerang cannot pass through a wall even when its owner has the power', () => {
    let s = arenaWith({ x: 130, y: 450 });
    s = place(s, 'b', 300, 450);
    s = flying(s, 'a', { x: 150, y: 450 }, RIGHT);
    const r = run(s, 10);
    expect(boom(r.state, 'a').position.x).toBeLessThanOrEqual(200 - C.boomerangRadius + 1e-6);
    expect(player(r.state, 'b').alive).toBe(true);
  });
});

describe('crossing a thin wall', () => {
  it('goes through, comes out the other side in valid space, and announces entry then exit', () => {
    const { state, trail, events } = dashFrom(arenaWith({ x: 130, y: 450 }), RIGHT);
    expect(embedded(trail)).toBe(true); // it really was inside the wall part-way
    expect(at(state, 'a').x).toBeCloseTo(130 + FULL, 6);
    expect(valid(at(state, 'a'))).toBe(true);
    expect(at(state, 'a').y).toBeCloseTo(450, 9); // a straight line
    const order = types(events).filter((t) => t === 'PHASE_ENTERED' || t === 'PHASE_EXITED');
    expect(order).toEqual(['PHASE_ENTERED', 'PHASE_EXITED']);
    expect(events.find((e) => e.type === 'DASHED')).toMatchObject({ phasing: true });
  });

  it('every step of the trajectory is a real position along the line (no teleport): steps are dash-sized', () => {
    const { trail } = dashFrom(arenaWith({ x: 130, y: 450 }), RIGHT);
    for (let i = 1; i < trail.length; i += 1) {
      const step = (trail[i] as { x: number }).x - (trail[i - 1] as { x: number }).x;
      expect(step).toBeGreaterThan(0);
      expect(step).toBeLessThanOrEqual(C.dashSpeed * DT + 1e-6);
    }
  });

  it('spends one charge on entering the wall, counts as a successful dash for fatigue, and nothing else', () => {
    const { state } = dashFrom(arenaWith({ x: 130, y: 450 }), RIGHT);
    expect(player(state, 'a').powers.phase).toBe(1);
    expect(player(state, 'a').fatigue.dashes).toBe(1);
  });

  it('a dash through open ground is a plain dash: no charge spent, no phase events', () => {
    const { state, events } = dashFrom(arenaWith({ x: 800, y: 250 }), RIGHT);
    expect(player(state, 'a').powers.phase).toBe(2);
    expect(types(events)).not.toContain('PHASE_ENTERED');
    expect(at(state, 'a').x).toBeCloseTo(800 + FULL, 6);
  });

  it('through the gate wall of the top lane, between the covers', () => {
    const { state } = dashFrom(arenaWith({ x: 650, y: 100 }), { x: 0, y: 1 });
    expect(at(state, 'a').y).toBeCloseTo(100 + FULL, 6);
    expect(valid(at(state, 'a'))).toBe(true);
  });

  it('is exactly as long as a normal dash in open ground (it does not travel farther for being phased)', () => {
    const phased = dashFrom(arenaWith({ x: 800, y: 250 }), RIGHT).state;
    const plain = dashFrom(arenaWith({ x: 800, y: 250 }, 0), RIGHT).state;
    expect(at(phased, 'a').x).toBeCloseTo(at(plain, 'a').x, 9);
    expect(at(phased, 'a').y).toBeCloseTo(at(plain, 'a').y, 9);
  });
});

describe('crossing a thick wall needs enough dash', () => {
  it('the central block (120 deep) cannot be crossed by a full dash: it stops flush; the charge is not spent', () => {
    const { state, events } = dashFrom(arenaWith({ x: 800, y: 330 }), { x: 0, y: 1 });
    expect(at(state, 'a').y).toBeCloseTo(390 - R, 6);
    expect(valid(at(state, 'a'))).toBe(true);
    expect(types(events)).not.toContain('PHASE_ENTERED');
    expect(player(state, 'a').powers.phase).toBe(2); // used only when you actually phase
    expect(player(state, 'a').fatigue.dashes).toBe(1); // but it was a successful dash
  });

  it('with OVERDRIVE the same dash is long enough to cross it', () => {
    const s = arenaWith({ x: 800, y: 330 }, 2, (x) => patchPowers(x, 'a', { overdrive: 100 }));
    const { state, trail } = dashFrom(s, { x: 0, y: 1 });
    expect(embedded(trail)).toBe(true);
    expect(at(state, 'a').y).toBeCloseTo(330 + BOOSTED, 6);
    expect(valid(at(state, 'a'))).toBe(true);
  });
});

describe('an insufficient dash NEVER leaves anyone embedded', () => {
  it.each([
    ['full', 0, FULL],
    ['fatigued', 1, FATIGUED_LENGTH],
    ['overdriven', 2, BOOSTED],
  ])(
    '%s dash, from every starting distance, in four directions: always valid, never past its length',
    (_name, mode, length) => {
      let checked = 0;
      const wallCentres = [
        { x: 225, y: 450, dirs: [[1, 0]], from: (d: number) => ({ x: 225 - d, y: 450 }) },
        { x: 560, y: 350, dirs: [[0, 1]], from: (d: number) => ({ x: 560, y: 350 - d }) },
        { x: 800, y: 450, dirs: [[0, 1]], from: (d: number) => ({ x: 800, y: 450 - d }) },
        { x: 800, y: 450, dirs: [[-1, 0]], from: (d: number) => ({ x: 800 + 100 + d, y: 450 }) },
      ];
      for (const wc of wallCentres) {
        for (let d = 70; d < 330; d += 7) {
          const start = wc.from(d);
          if (
            !valid(start) ||
            start.x < R ||
            start.x > 1600 - R ||
            start.y < R ||
            start.y > 900 - R
          )
            continue;
          const dir = wc.dirs[0] as number[];
          const s = arenaWith(start, 2, (x) => {
            let y = x;
            if (mode === 1) y = patchPlayer(y, 'a', { fatigue: { dashes: 9, recoverIn: 4 } });
            if (mode === 2) y = patchPowers(y, 'a', { overdrive: 100 });
            return y;
          });
          const result = dashFrom(s, { x: dir[0] as number, y: dir[1] as number });
          const end = at(result.state, 'a');
          expect(valid(end), `from ${JSON.stringify(start)} ${dir}`).toBe(true);
          const travelled = Math.hypot(end.x - start.x, end.y - start.y);
          expect(travelled).toBeLessThanOrEqual(length + 1e-6);
          // and no step of the way was outside the arena
          for (const p of result.trail) {
            expect(p.x).toBeGreaterThanOrEqual(R - 1e-9);
            expect(p.y).toBeGreaterThanOrEqual(R - 1e-9);
          }
          checked += 1;
        }
      }
      expect(checked).toBeGreaterThan(60);
    },
  );
});

describe('several walls, corners, corridors', () => {
  it('crosses one wall and stops in the gap before the next when it cannot cross both (finishing inside the second is refused)', () => {
    // From x=130 an overdriven dash would end inside the corridor's inner wall (350–400): it stops flush before it.
    const s = arenaWith({ x: 130, y: 450 }, 2, (x) => patchPowers(x, 'a', { overdrive: 100 }));
    const { state } = dashFrom(s, RIGHT);
    expect(at(state, 'a').x).toBeCloseTo(350 - R, 6);
    expect(valid(at(state, 'a'))).toBe(true);
    // a plain full dash from the same place ends in the corridor
    const plain = dashFrom(arenaWith({ x: 130, y: 450 }), RIGHT).state;
    expect(at(plain, 'a').x).toBeCloseTo(130 + FULL, 6);
  });

  it('inside a corridor, a plain dash is stopped by its far wall; a phase dash crosses that wall too — and only walls', () => {
    const plain = dashFrom(arenaWith({ x: 300, y: 450 }, 0), RIGHT).state;
    expect(at(plain, 'a').x).toBeCloseTo(350 - R, 6); // one body wide: the corridor's own wall stops a normal dash
    const phased = dashFrom(arenaWith({ x: 300, y: 450 }), RIGHT).state;
    expect(at(phased, 'a').x).toBeCloseTo(300 + FULL, 6); // 476: out of the far side of the inner wall (350–400)
    expect(valid(at(phased, 'a'))).toBe(true);
  });

  it('can cross both corridor walls only with enough dash from close enough (here: it cannot, and says so by stopping)', () => {
    const s = arenaWith({ x: 164, y: 450 }, 2, (x) => patchPowers(x, 'a', { overdrive: 100 }));
    const { state } = dashFrom(s, RIGHT);
    expect(valid(at(state, 'a'))).toBe(true);
    expect(at(state, 'a').x).toBeLessThanOrEqual(350 - R + 1e-6);
  });

  it('a corner: heading diagonally into a block corner, it stops flush on the line, valid, having moved', () => {
    const d = Math.SQRT1_2;
    const { state } = dashFrom(arenaWith({ x: 460, y: 250 }), { x: d, y: d });
    const end = at(state, 'a');
    expect(valid(end)).toBe(true);
    expect(end.x - 460).toBeCloseTo(end.y - 250, 6); // still the same straight line
    expect(end.x).toBeGreaterThan(470);
    expect(distanceToRect(end, { x: 520, y: 310, width: 80, height: 80 })).toBeCloseTo(R, 6);
  });
});

describe('living players and the arena boundary are not phaseable', () => {
  it('a living player standing in the exit: it stops flush before the wall (the exit is unreachable), never embedded', () => {
    let s = arenaWith({ x: 130, y: 450 });
    s = place(s, 'b', 310, 450);
    const { state } = dashFrom(s, RIGHT);
    expect(at(state, 'a').x).toBeCloseTo(200 - R, 6);
    expect(valid(at(state, 'a'))).toBe(true);
    expect(at(state, 'b')).toEqual({ x: 310, y: 450 }); // nobody was shoved
    expect(player(state, 'b').alive).toBe(true); // and it is not an attack
  });

  it('a living player just beyond the exit: it crosses the wall and stops in contact with them', () => {
    // the 80-wide cover block; Bob stands beyond it, where Alice's circle can come out and touch him
    let s = arenaWith({ x: 520 - R, y: 350 });
    s = place(s, 'b', 720, 350);
    const { state } = dashFrom(s, RIGHT);
    expect(at(state, 'b')).toEqual({ x: 720, y: 350 }); // not shoved
    expect(at(state, 'a').x).toBeCloseTo(720 - 2 * R, 6);
    expect(valid(at(state, 'a'))).toBe(true);
    expect(player(state, 'b').alive).toBe(true);
  });

  it('the arena boundary stops it: it never leaves the arena, along a straight line', () => {
    const left = dashFrom(arenaWith({ x: 110, y: 450 }), { x: -1, y: 0 });
    expect(at(left.state, 'a').x).toBeCloseTo(R, 6);
    const d = Math.SQRT1_2;
    const corner = dashFrom(arenaWith({ x: 110, y: 110 }), { x: -d, y: -d });
    expect(at(corner.state, 'a').x).toBeCloseTo(R, 6);
    expect(at(corner.state, 'a').y).toBeCloseTo(R, 6);
    for (const p of [...left.trail, ...corner.trail]) {
      expect(p.x).toBeGreaterThanOrEqual(R - 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(R - 1e-9);
    }
  });
});

describe('fatigue: a Phase Dash is a DASH', () => {
  it('counts toward the 8 free dashes: the 9th is fatigued, and phased dashes continue while fatigued at 70%', () => {
    let s = arenaWith({ x: 800, y: 250 }, 2);
    s = place(s, 'a', 800, 250);
    for (let n = 1; n <= 8; n += 1) {
      s = patchPlayer(s, 'a', {}); // (explicit: nothing special is done for the nth dash)
      const before = at(s, 'a');
      const dir = n % 2 === 1 ? RIGHT : { x: -1, y: 0 };
      s = dashFrom(s, dir).state;
      expect(Math.abs(at(s, 'a').x - before.x), `dash ${n}`).toBeCloseTo(FULL, 6);
    }
    expect(player(s, 'a').fatigue.dashes).toBe(8);
    const ninth = dashFrom(s, RIGHT);
    expect(player(ninth.state, 'a').fatigue.dashes).toBe(9);
    expect(types(ninth.events)).toContain('FATIGUED');
    expect(at(ninth.state, 'a').x - at(s, 'a').x).toBeCloseTo(FATIGUED_LENGTH, 6);
  });

  it('a fatigued Phase Dash crosses a thin wall only from close enough (123 is barely enough: from flush)', () => {
    const fatigued = (s: FuState) => patchPlayer(s, 'a', { fatigue: { dashes: 9, recoverIn: 4 } });
    const flush = dashFrom(arenaWith({ x: 200 - R, y: 450 }, 2, fatigued), RIGHT);
    expect(at(flush.state, 'a').x).toBeCloseTo(200 - R + FATIGUED_LENGTH, 6);
    expect(valid(at(flush.state, 'a'))).toBe(true);
    const short = dashFrom(arenaWith({ x: 150, y: 450 }, 2, fatigued), RIGHT);
    expect(at(short.state, 'a').x).toBeCloseTo(200 - R, 6); // not enough: stops flush, never embedded
    expect(player(short.state, 'a').fatigue.dashes).toBe(10);
  });

  it('does not reset, bypass or add to the allowance, and the recovery clock restarts as for any dash', () => {
    let s = arenaWith({ x: 130, y: 450 });
    s = patchPlayer(s, 'a', { fatigue: { dashes: 9, recoverIn: 1 } });
    const r = dashFrom(s, RIGHT).state;
    expect(player(r, 'a').fatigue.dashes).toBe(10);
    expect(player(r, 'a').fatigue.recoverIn).toBeGreaterThan(4);
  });
});

describe('charges', () => {
  it('there are exactly phaseDashCharges phase crossings; the next one is a normal dash stopped flush', () => {
    expect(C.phaseDashCharges).toBe(2);
    let s = arenaWith({ x: 130, y: 450 }, C.phaseDashCharges);
    s = dashFrom(s, RIGHT).state; // 130 → 306 through the outer wall
    expect(player(s, 'a').powers.phase).toBe(1);
    s = place(s, 'a', 130, 450);
    s = dashFrom(s, RIGHT).state;
    expect(player(s, 'a').powers.phase).toBe(0);
    expect(at(s, 'a').x).toBeCloseTo(130 + FULL, 6);
    s = place(s, 'a', 130, 450);
    s = dashFrom(s, RIGHT).state; // out of charges
    expect(at(s, 'a').x).toBeCloseTo(200 - R, 6);
  });

  it('a start that is not valid space (patched into a wall) is never phased: a normal dash, no charge spent', () => {
    const s = arenaWith({ x: 225, y: 450 }); // inside the wall: invalid
    const r = stepFu(s, input({ a: { dash: true, move: RIGHT } }), DT);
    expect(types(r.events)).not.toContain('PHASE_ENTERED');
    expect(player(r.state, 'a').powers.phase).toBe(2);
    expect(player(r.state, 'a').dash).not.toHaveProperty('phasing');
  });
});

describe('no invulnerability: a phasing player is vulnerable to everything', () => {
  /** Alice dashes from 130 through the outer wall; hostile things wait on the near side. */
  const hostile = (s: FuState) => place(s, 'b', 100, 850);

  it('THROWN boomerang: it kills her while she is inside the wall', () => {
    const s = flying(
      hostile(arenaWith({ x: 130, y: 450 })),
      'b',
      { x: 186, y: 380 },
      { x: 0, y: 1 },
    );
    let state = stepFu(s, input({ a: { dash: true, move: RIGHT } }), DT).state;
    let diedInside = false;
    for (let i = 0; i < 12 && player(state, 'a').alive; i += 1) {
      state = stepFu(state, NONE, DT).state;
      if (!player(state, 'a').alive) diedInside = !valid(at(state, 'a'));
    }
    expect(player(state, 'a').alive).toBe(false);
    expect(diedInside).toBe(true);
    // the same boomerang does not reach someone merely standing 56 away
    let t = flying(hostile(arenaWith({ x: 130, y: 450 })), 'b', { x: 186, y: 380 }, { x: 0, y: 1 });
    t = run(t, 12).state;
    expect(player(t, 'a').alive).toBe(true);
  });

  it('RETURNING boomerang', () => {
    let s = arenaWith({ x: 130, y: 450 });
    s = place(s, 'b', 164, 600);
    s = patchBoomerang(s, 'b', {
      state: 'RETURNING',
      position: { x: 186, y: 400 },
      direction: { x: 0, y: 0 },
    });
    const r = run(s, 12, input({ a: { dash: true, move: RIGHT } }));
    expect(player(r.state, 'a').alive).toBe(false);
  });

  it('DEFLECTED boomerang', () => {
    let s = make(['a', 'b', 'c'], { arena: PRIMITIVE_ARENA });
    s = place(place(place(s, 'a', 130, 450), 'b', 1500, 850), 'c', 1500, 100);
    s = patchPowers(s, 'a', { phase: 2 });
    s = patchBoomerang(s, 'b', {
      state: 'DEFLECTED',
      position: { x: 186, y: 380 },
      direction: { x: 0, y: 1 },
      deflectedBy: 'c',
      deflections: 1,
    });
    const r = run(s, 12, input({ a: { dash: true, move: RIGHT } }));
    expect(player(r.state, 'a').alive).toBe(false);
  });

  it('SLASH: an enemy beside the wall hits her while she is in it (the walls she overlaps do not shelter her)…', () => {
    let s = arenaWith({ x: 130, y: 450 });
    s = place(s, 'b', 164, 450 + 80);
    s = patchPlayer(s, 'b', { facing: { x: 1, y: -0.3 } });
    // Alice is mid-wall (x ≈ 222) three steps in; Bob swings across at her
    let state = run(s, 3, input({ a: { dash: true, move: RIGHT } })).state;
    expect(valid(at(state, 'a'))).toBe(false);
    state = patchPlayer(state, 'b', {
      facing: { x: at(state, 'a').x - 164, y: at(state, 'a').y - 530 },
      slash: {
        phase: 'ACTIVE',
        direction: normalise(at(state, 'a').x - 164, at(state, 'a').y - 530),
        remaining: 0.12,
      },
    });
    state = stepFu(state, NONE, DT).state;
    expect(player(state, 'a').alive).toBe(false);
  });

  it('…but a player standing normally behind the same wall is still sheltered from that swing', () => {
    let s = make(['a', 'b', 'c'], { arena: PRIMITIVE_ARENA });
    s = place(place(place(s, 'a', 1500, 850), 'b', 164, 450), 'c', 290, 450); // c is 126 from b, wall between
    s = patchPlayer(s, 'b', { facing: RIGHT });
    const r = stepFu(s, input({ b: { slash: true } }), DT);
    expect(player(r.state, 'c').alive).toBe(true);
  });

  it('GUARD: absorbs a hit taken mid-wall like anywhere else (and is then spent)', () => {
    let s = arenaWith({ x: 130, y: 450 });
    s = give(patchPowers(s, 'a', { phase: 2 }), 'a', 'GUARD');
    s = place(s, 'a', 130, 450);
    s = place(s, 'b', 186, 380);
    s = flying(s, 'b', { x: 186, y: 380 }, { x: 0, y: 1 });
    const r = run(s, 12, input({ a: { dash: true, move: RIGHT } }));
    expect(player(r.state, 'a').alive).toBe(true);
    expect(player(r.state, 'a').powers.guard).toBe(false);
    expect(r.events.some((e) => e.type === 'GUARD_BLOCKED')).toBe(true);
  });

  it('BLAST: a blast beside the wall kills her mid-wall (her overlap does not shelter her), but not a player in the corridor behind it', () => {
    let s = make(['a', 'b', 'c'], { arena: PRIMITIVE_ARENA });
    s = place(place(place(s, 'a', 130, 450), 'b', 100, 850), 'c', 300, 450);
    s = patchPowers(s, 'a', { phase: 2 });
    s = patchBoomerang(s, 'b', {
      state: 'THROWN',
      position: { x: 186, y: 380 },
      direction: { x: 0, y: 1 },
      travelled: 0,
      blast: true,
    });
    const r = run(s, 12, input({ a: { dash: true, move: RIGHT } }));
    expect(player(r.state, 'a').alive).toBe(false);
    expect(player(r.state, 'c').alive).toBe(true);
  });

  it('two players phasing at each other through the same wall: each is stopped by the other; both end valid', () => {
    let s = make(['a', 'b'], { arena: PRIMITIVE_ARENA });
    s = place(place(s, 'a', 130, 450), 'b', 390, 450);
    s = patchPowers(patchPowers(s, 'a', { phase: 2 }), 'b', { phase: 2 });
    let state = stepFu(
      s,
      input({ a: { dash: true, move: RIGHT }, b: { dash: true, move: { x: -1, y: 0 } } }),
      DT,
    ).state;
    for (let i = 0; i < 20; i += 1) state = stepFu(state, NONE, DT).state;
    expect(valid(at(state, 'a'))).toBe(true);
    expect(valid(at(state, 'b'))).toBe(true);
    expect(Math.hypot(at(state, 'a').x - at(state, 'b').x, 0)).toBeGreaterThanOrEqual(2 * R - 1e-6);
    expect(player(state, 'a').alive && player(state, 'b').alive).toBe(true);
  });
});

const normalise = (x: number, y: number) => {
  const l = Math.hypot(x, y);
  return { x: x / l, y: y / l };
};

describe('walls are solid again the moment the dash is over', () => {
  it('after a phase dash, walking into the next wall stops flush; nothing is permanently loosened', () => {
    let s = dashFrom(arenaWith({ x: 130, y: 450 }, 1), RIGHT).state; // ends at 306, in the corridor
    expect(player(s, 'a').powers.phase).toBe(0);
    s = run(s, 300, input({ a: { move: RIGHT } }), { repeat: true }).state;
    expect(at(s, 'a').x).toBeCloseTo(350 - R, 6);
    s = run(s, 300, input({ a: { move: { x: -1, y: 0 } } }), { repeat: true }).state;
    expect(at(s, 'a').x).toBeCloseTo(250 + R, 6); // back against the wall it came through, from the other side
  });

  it('a second dash with no charges left is stopped by a wall', () => {
    let s = dashFrom(arenaWith({ x: 130, y: 450 }, 1), RIGHT).state;
    s = place(s, 'a', 286, 450);
    const r = dashFrom(s, RIGHT);
    expect(at(r.state, 'a').x).toBeCloseTo(350 - R, 6);
  });
});

describe('determinism, accepted dt and invariants', () => {
  it('the same crossing at any accepted dt ends in the same place, valid', () => {
    for (const start of [
      { x: 130, y: 450 },
      { x: 150, y: 450 },
    ]) {
      const fixed = dashFrom(arenaWith(start), RIGHT, DT).state;
      for (const dt of [0.05, 0.1]) {
        const big = dashFrom(arenaWith(start), RIGHT, dt).state;
        expect(at(big, 'a').x, `dt ${dt} from ${start.x}`).toBeCloseTo(at(fixed, 'a').x, 6);
        expect(valid(at(big, 'a'))).toBe(true);
      }
    }
  });

  it('replays to the identical state and events', () => {
    const play = () => {
      let s = make(['a', 'b', 'c'], { arena: PRIMITIVE_ARENA });
      const log: unknown[] = [];
      for (let i = 0; i < 2000; i += 1) {
        if (i % 150 === 0) s = patchPowers(patchPowers(s, 'a', { phase: 2 }), 'c', { phase: 2 });
        const r = stepFu(
          s,
          input({
            a: { move: { x: Math.cos(i / 25), y: Math.sin(i / 31) }, dash: i % 11 === 0 },
            b: { move: { x: Math.sin(i / 19), y: Math.cos(i / 23) }, dash: i % 17 === 0 },
            c: {
              move: { x: -Math.cos(i / 29), y: Math.sin(i / 37) },
              dash: i % 13 === 0,
              slash: i % 71 === 0,
            },
          }),
          DT,
        );
        s = r.state;
        log.push(r.events);
      }
      return JSON.stringify({ s, log });
    };
    expect(play()).toBe(play());
  });

  it('INVARIANT: nobody who is not mid-dash is ever inside a wall, however many phase dashes are thrown at the geometry', () => {
    let s = make(['a', 'b', 'c', 'd'], { arena: PRIMITIVE_ARENA });
    let crossings = 0;
    for (let i = 0; i < 6000; i += 1) {
      if (i % 90 === 0) {
        for (const id of ['a', 'b', 'c', 'd']) s = patchPowers(s, id, { phase: 2, guard: true });
      }
      const k = (n: number) => Math.sin(i / n + n);
      const r = stepFu(
        s,
        input({
          a: { move: { x: k(17), y: k(23) }, dash: i % 7 === 0 },
          b: { move: { x: k(19), y: k(29) }, dash: i % 9 === 0 },
          c: { move: { x: k(13), y: k(31) }, dash: i % 8 === 0 },
          d: { move: { x: k(11), y: k(37) }, dash: i % 10 === 0 },
        }),
        DT,
      );
      s = r.state;
      crossings += r.events.filter((e) => e.type === 'PHASE_ENTERED').length;
      for (const p of s.players) {
        if (!p.alive) continue;
        const where = at(s, p.id);
        const phasing = p.dash.phase === 'DASHING' && 'phasing' in p.dash;
        if (!phasing)
          expect(validWithin(where), `step ${i} ${p.id} ${JSON.stringify(where)}`).toBe(true);
        expect(where.x).toBeGreaterThanOrEqual(R - 1e-6);
        expect(where.x).toBeLessThanOrEqual(1600 - R + 1e-6);
        expect(where.y).toBeGreaterThanOrEqual(R - 1e-6);
        expect(where.y).toBeLessThanOrEqual(900 - R + 1e-6);
      }
      if (s.phase === 'ROUND_OVER') {
        s = {
          ...s,
          phase: 'PLAYING',
          roundOver: undefined,
          players: s.players.map((p) => ({ ...p, alive: true })),
        };
      }
    }
    expect(crossings).toBeGreaterThan(5); // the fuzz really did phase through walls
  });
});

describe('PHASE_DASH and the other powers (the charge model)', () => {
  it('malformed charge counts never phase: zero, negative or non-integer charges do nothing special', () => {
    for (const phase of [0, -1, Number.NaN]) {
      const { state } = dashFrom(arenaWith({ x: 130, y: 450 }, phase as number), RIGHT);
      expect(at(state, 'a').x).toBeCloseTo(200 - R, 6);
    }
  });
});
