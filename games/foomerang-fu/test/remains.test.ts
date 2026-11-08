import { describe, expect, it } from 'vitest';
import { REMAINS, remainsOf, stepRemains, type Remain, type Pusher } from '../src/rules';
import { C, DT, R, flying, make, place, run, input, type FuState } from './support/fixtures';

// The dead are solid (owner, 2026-11-07: "when the dead bodies are there … players pass through them, that should not be the
// case, they should be solid … if a player moves against the dead body they should basically be able to move the body
// around"). A killed character comes apart in two (render/cutMotion.ts, the HQs): the bottom where it stood, the top sliding
// off along the hit to a stop. Both pieces are bodies of the rules: a living player who walks into one shoves it along (it
// slides on a little after a shove, then stops); pieces never pass into walls or into one another; a piece pinned against a
// wall stops the player. A new round clears them.

const ARENA = { width: 1600, height: 900 };
const piece = (rs: readonly Remain[], kind: Remain['piece']): Remain => {
  const r = rs.find((x) => x.piece === kind);
  if (r === undefined) throw new Error(`no ${kind}`);
  return r;
};
const step = (rs: readonly Remain[], n: number, players: Pusher[] = [], walls: never[] = []) => {
  let out = rs;
  for (let i = 0; i < n; i += 1) out = stepRemains(out, players, walls, ARENA, DT).remains;
  return out;
};
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('a killed character leaves two solid pieces', () => {
  const rs = remainsOf('b', { x: 800, y: 450 }, { x: 1, y: 0 }, false, R);

  it('the bottom where it stood, still; the top there too, leaving along the hit', () => {
    expect(rs.map((r) => r.piece).sort()).toEqual(['bottom', 'top']);
    expect(piece(rs, 'bottom').position).toEqual({ x: 800, y: 450 });
    expect(piece(rs, 'bottom').velocity).toEqual({ x: 0, y: 0 });
    expect(piece(rs, 'top').velocity.x).toBeGreaterThan(0);
    expect(piece(rs, 'top').velocity.y).toBeCloseTo(0, 9);
    for (const r of rs) expect(r.ownerId).toBe('b');
  });

  it('the top slides off to a stop about one and a half widths away, as the HQs (0.9-2.6 widths)', () => {
    const end = step(rs, 400);
    const d = piece(end, 'top').position.x - 800;
    expect(d).toBeGreaterThan(0.9 * 76);
    expect(d).toBeLessThan(2.6 * 76);
    expect(piece(end, 'top').velocity).toEqual({ x: 0, y: 0 });
    expect(piece(end, 'bottom').position).toEqual({ x: 800, y: 450 });
  });

  it('an explosion flings the top about three times as far', () => {
    const blown = remainsOf('b', { x: 800, y: 450 }, { x: 1, y: 0 }, true, R);
    const a = piece(step(rs, 400), 'top').position.x - 800;
    const b = piece(step(blown, 400), 'top').position.x - 800;
    expect(b / a).toBeCloseTo(REMAINS.blown, 1);
  });

  it('a burnt one is not cut: it is one piece, the whole body, lying where it died (HQ1 9:57.6)', () => {
    const burnt = remainsOf('b', { x: 800, y: 450 }, { x: 1, y: 0 }, false, R, true);
    expect(burnt.map((r) => r.piece)).toEqual(['bottom']);
    expect(piece(burnt, 'bottom').radius).toBe(R);
    expect(piece(step(burnt, 100), 'bottom').position).toEqual({ x: 800, y: 450 });
  });

  it('with no direction (a hazard) both stay where it died', () => {
    const still = remainsOf('b', { x: 800, y: 450 }, undefined, false, R);
    for (const r of step(still, 100)) expect(dist(r.position, { x: 800, y: 450 })).toBeLessThan(R);
  });
});

describe('a living player shoves a piece', () => {
  const lone = remainsOf('b', { x: 800, y: 450 }, undefined, false, R).filter(
    (r) => r.piece === 'bottom',
  );
  const bottom = piece(lone, 'bottom');

  it('a player overlapping a piece pushes it clear, to touching', () => {
    const me: Pusher = { id: 'a', position: { x: 800 - R, y: 450 }, radius: R };
    const out = stepRemains(lone, [me], [], ARENA, DT);
    const p = piece(out.remains, 'bottom');
    expect(dist(p.position, me.position)).toBeCloseTo(R + bottom.radius, 6);
    expect(p.position.x).toBeGreaterThan(800);
  });

  it('walking into it carries it along ahead of the player', () => {
    let rs: readonly Remain[] = lone;
    let x = 800 - R - bottom.radius;
    for (let i = 0; i < 120; i += 1) {
      x += C.playerSpeed * DT;
      rs = stepRemains(
        rs,
        [{ id: 'a', position: { x, y: 450 }, radius: R }],
        [],
        ARENA,
        DT,
      ).remains;
    }
    const p = piece(rs, 'bottom');
    expect(p.position.x).toBeGreaterThan(x);
    expect(p.position.x - x).toBeGreaterThanOrEqual(R + bottom.radius - 1e-6);
    expect(p.position.x - 800).toBeGreaterThan(200); // two seconds of walking moved it a long way
  });

  it('slides on a little after the shove, then stops', () => {
    const shoved = stepRemains(
      lone,
      [{ id: 'a', position: { x: 800 - R, y: 450 }, radius: R }],
      [],
      ARENA,
      DT,
    ).remains;
    const after = piece(shoved, 'bottom');
    expect(after.velocity.x).toBeGreaterThan(0);
    const later = piece(step(shoved, 300), 'bottom');
    expect(later.position.x).toBeGreaterThan(after.position.x);
    expect(later.velocity).toEqual({ x: 0, y: 0 });
  });
});

describe('pieces are solid among themselves and against walls', () => {
  it('two pieces never end up inside one another', () => {
    const a = remainsOf('b', { x: 800, y: 450 }, undefined, false, R);
    const b = remainsOf('c', { x: 805, y: 452 }, undefined, false, R);
    const rs = step([...a, ...b], 30);
    for (let i = 0; i < rs.length; i += 1)
      for (let j = i + 1; j < rs.length; j += 1) {
        const p = rs[i] as Remain;
        const q = rs[j] as Remain;
        expect(dist(p.position, q.position)).toBeGreaterThanOrEqual(p.radius + q.radius - 1e-3);
      }
  });

  it('a sliding top stops at a wall, never inside it', () => {
    const wall = {
      shape: 'box',
      x: 900,
      y: 450,
      halfWidth: 20,
      halfHeight: 300,
      angle: 0,
    } as const;
    const rs = remainsOf('b', { x: 800, y: 450 }, { x: 1, y: 0 }, true, R);
    const end = step(rs, 400, [], [wall] as never);
    expect(piece(end, 'top').position.x).toBeLessThanOrEqual(880 - piece(end, 'top').radius + 1e-6);
  });

  it('a piece pinned against a wall is never pushed into it, and never traps the player (who squeezes past)', () => {
    const wall = {
      shape: 'box',
      x: 900,
      y: 450,
      halfWidth: 20,
      halfHeight: 300,
      angle: 0,
    } as const;
    const bottom = remainsOf('b', { x: 850, y: 450 }, undefined, false, R).filter(
      (r) => r.piece === 'bottom',
    );
    const r = piece(bottom, 'bottom').radius;
    const pinned = { ...piece(bottom, 'bottom'), position: { x: 880 - r, y: 450 } };
    const me: Pusher = { id: 'a', position: { x: 880 - 2 * r - R + 10, y: 450 }, radius: R };
    const out = stepRemains([pinned], [me], [wall] as never, ARENA, DT);
    expect(piece(out.remains, 'bottom').position.x).toBeLessThanOrEqual(880 - r + 1e-6);
    expect(Object.keys(out)).toEqual(['remains']); // nothing holds the player
  });
});

describe('in the match', () => {
  const killed = (): FuState => {
    let s = make(['a', 'b', 'c'], { throwCurvature: 0, returnTurnRadius: 0 });
    s = place(place(place(s, 'a', 200, 450), 'b', 600, 450), 'c', 1400, 800);
    s = flying(s, 'a', { x: 300, y: 450 }, { x: 1, y: 0 });
    return run(s, 30).state;
  };

  it('a kill leaves the victim’s two pieces, the top going the way the hit went', () => {
    const s = killed();
    const rs = s.remains ?? [];
    expect(
      rs
        .filter((r) => r.ownerId === 'b')
        .map((r) => r.piece)
        .sort(),
    ).toEqual(['bottom', 'top']);
    const top = piece(rs, 'top');
    expect(top.position.x).toBeGreaterThan(600);
  });

  it('a living player walking into the bottom moves it', () => {
    let s = killed();
    const before = piece(s.remains ?? [], 'bottom').position;
    s = place(s, 'c', before.x, before.y + R + 40);
    s = run(s, 60, input({ c: { move: { x: 0, y: -1 } } }), { repeat: true }).state;
    const after = piece(s.remains ?? [], 'bottom').position;
    expect(dist(after, before)).toBeGreaterThan(40);
    const c = s.world.bodies.find((b) => b.id === 'c');
    expect(dist(c?.position ?? { x: 0, y: 0 }, after)).toBeGreaterThanOrEqual(
      R + piece(s.remains ?? [], 'bottom').radius - 1e-3,
    );
  });
});
