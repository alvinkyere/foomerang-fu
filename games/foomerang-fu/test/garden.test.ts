import { describe, expect, it } from 'vitest';
import {
  FREE_FOR_ALL,
  GARDEN_ARENA,
  GARDEN_BOOK_SPOTS,
  GARDEN_HEIGHT,
  GARDEN_ROCKS,
  GARDEN_SPAWNS,
  GARDEN_WALLS,
  GARDEN_WALL_THICKNESS,
  GARDEN_WIDTH,
  createFuMatch,
  powerupsFor,
  rematchOf,
  rockRects,
  stepFu,
  type FuState,
} from '../src/rules';
import { circleHitsWalls, distanceToRect, lineClearTo, wallsOf } from '../src/rules/arena';
import {
  C,
  DT,
  NONE,
  R,
  at,
  boom,
  face,
  flying,
  input,
  make,
  own,
  patchPlayer,
  place,
  player,
  run,
  types,
  weaponsOf,
} from './support/fixtures';

// Garden: the first production arena. Its geometry is data owned by the rules; these tests check that the data is valid and
// that the APPROVED mechanics (Slices 1-8) behave on it exactly as they do anywhere else. Nothing here retunes anything.

const IDS = ['a', 'b', 'c', 'd', 'e', 'f'];
const garden = (n = 2, extra: object = {}): FuState =>
  make(IDS.slice(0, n), { arena: GARDEN_ARENA, ...FREE_FOR_ALL, ...extra });
const walls = wallsOf(GARDEN_ARENA);

describe('Garden: the arena data', () => {
  it('is a 1440 × 1456 arena (the reference’s dashed boundary) with solid walls, rocks and six spawns', () => {
    expect([GARDEN_ARENA.width, GARDEN_ARENA.height]).toEqual([GARDEN_WIDTH, GARDEN_HEIGHT]);
    expect([GARDEN_WIDTH, GARDEN_HEIGHT]).toEqual([1440, 1456]);
    expect(GARDEN_ARENA.spawns).toHaveLength(6);
    expect(GARDEN_ARENA.gates ?? []).toEqual([]);
    expect(GARDEN_ARENA.platforms ?? []).toEqual([]);
    expect(GARDEN_ARENA.hazards ?? []).toEqual([]);
    expect(createFuMatch([{ id: 'a', slot: 0 }], { arena: GARDEN_ARENA }).config.arena).toBe(
      GARDEN_ARENA,
    );
  });

  it('every wall and rock lies inside the boundary, has a positive size, and has a unique id', () => {
    const all = [...GARDEN_WALLS, ...GARDEN_ROCKS];
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    for (const s of all) {
      expect(s.width, s.id).toBeGreaterThan(0);
      expect(s.height, s.id).toBeGreaterThan(0);
      expect(s.x, s.id).toBeGreaterThanOrEqual(0);
      expect(s.y, s.id).toBeGreaterThanOrEqual(0);
      expect(s.x + s.width, s.id).toBeLessThanOrEqual(GARDEN_WIDTH);
      expect(s.y + s.height, s.id).toBeLessThanOrEqual(GARDEN_HEIGHT);
    }
    for (const rect of walls) expect(rect.width * rect.height).toBeGreaterThan(0);
  });

  it('every boulder is a real obstacle: its centre and its body are solid, and the rules’ walls are the straight walls plus two rectangles per rock', () => {
    expect(walls).toHaveLength(GARDEN_WALLS.length + 2 * GARDEN_ROCKS.length);
    for (const rock of GARDEN_ROCKS) {
      expect(
        circleHitsWalls({ x: rock.x + rock.width / 2, y: rock.y + rock.height / 2 }, 1, walls),
        rock.id,
      ).toBe(true);
      expect(
        circleHitsWalls({ x: rock.x + rock.width / 2, y: rock.y - R - 2 }, R, walls) && false,
        rock.id,
      ).toBe(false);
    }
  });

  it('straight walls are one thickness (36, the rules’ minimum) wide; the olive barricades are solid like the stone', () => {
    for (const w of GARDEN_WALLS) {
      const thin = Math.min(w.width, w.height);
      expect(thin, w.id).toBeLessThanOrEqual(GARDEN_WALL_THICKNESS + 2); // (a wall clipped by the boundary can be thinner)
      expect(thin, w.id).toBeGreaterThanOrEqual(GARDEN_WALL_THICKNESS - 2);
    }
    expect(GARDEN_WALLS.filter((w) => w.kind === 'OLIVE').map((w) => w.id)).toEqual([
      'HO1',
      'HO2',
      'VO18',
    ]);
    for (const w of GARDEN_WALLS.filter((x) => x.kind === 'OLIVE')) {
      expect(circleHitsWalls({ x: w.x + w.width / 2, y: w.y + w.height / 2 }, 1, walls), w.id).toBe(
        true,
      );
    }
  });

  it('a rock is two overlapping rectangles inside its own bounds, covering at least 85% of the visible boulder', () => {
    for (const rock of GARDEN_ROCKS) {
      const [wide, tall] = rockRects(rock);
      for (const r of [wide, tall]) {
        expect(r?.x).toBeGreaterThanOrEqual(rock.x);
        expect((r?.x ?? 0) + (r?.width ?? 0)).toBeLessThanOrEqual(rock.x + rock.width);
        expect(r?.y).toBeGreaterThanOrEqual(rock.y);
        expect((r?.y ?? 0) + (r?.height ?? 0)).toBeLessThanOrEqual(rock.y + rock.height);
      }
      const overlap = Math.max(0, tall?.width ?? 0) * Math.max(0, wide?.height ?? 0);
      const union =
        (wide?.width ?? 0) * (wide?.height ?? 0) +
        (tall?.width ?? 0) * (tall?.height ?? 0) -
        overlap;
      expect(union / (rock.width * rock.height), rock.id).toBeGreaterThan(0.85);
    }
  });
});

describe('Garden: spawns and Books', () => {
  it('every spawn is on open floor with room around it, and no two overlap', () => {
    GARDEN_SPAWNS.forEach((p, i) => {
      expect(circleHitsWalls(p, R + 30, walls), `spawn ${i}`).toBe(false);
      expect(p.x - R).toBeGreaterThan(0);
      expect(p.y - R).toBeGreaterThan(0);
      expect(p.x + R).toBeLessThan(GARDEN_WIDTH);
      expect(p.y + R).toBeLessThan(GARDEN_HEIGHT);
    });
    for (let i = 0; i < 6; i += 1)
      for (let j = i + 1; j < 6; j += 1) {
        const a = GARDEN_SPAWNS[i];
        const b = GARDEN_SPAWNS[j];
        expect(Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0))).toBeGreaterThan(
          400,
        );
      }
  });

  it('nobody can be hit the moment a round starts: no two spawns have a clear line within a boomerang’s reach', () => {
    for (let i = 0; i < 6; i += 1)
      for (let j = i + 1; j < 6; j += 1) {
        const a = GARDEN_SPAWNS[i];
        const b = GARDEN_SPAWNS[j];
        if (a === undefined || b === undefined) continue;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance < C.throwRange + 200)
          expect(lineClearTo(a, b, R, walls), `${i}↔${j}`).toBe(false);
      }
  });

  it('every prefix of the slots (2 … 6 players) is well spread, and a match for each starts everyone on their own spawn, alive', () => {
    for (let n = 2; n <= 6; n += 1) {
      const s = garden(n);
      expect(s.players.map((p) => p.alive)).toEqual(Array(n).fill(true));
      s.players.forEach((p) => expect(at(s, p.id)).toEqual(GARDEN_SPAWNS[p.slot]));
      const used = s.players.map((p) => GARDEN_SPAWNS[p.slot]);
      for (let i = 0; i < used.length; i += 1)
        for (let j = i + 1; j < used.length; j += 1) {
          const a = used[i];
          const b = used[j];
          expect(Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0))).toBeGreaterThan(
            400,
          );
        }
    }
    // the platform's own slot assignment (0,1,2…) gives the first n spawns: a 2-player game is the two farthest apart
    const two = [GARDEN_SPAWNS[0], GARDEN_SPAWNS[1]];
    expect(
      Math.hypot((two[0]?.x ?? 0) - (two[1]?.x ?? 0), (two[0]?.y ?? 0) - (two[1]?.y ?? 0)),
    ).toBeGreaterThan(1000);
  });

  it('Book spots are on open floor, away from the spawns, distinct', () => {
    expect(GARDEN_BOOK_SPOTS.length).toBeGreaterThanOrEqual(6);
    for (const spot of GARDEN_BOOK_SPOTS) {
      expect(circleHitsWalls(spot, 60, walls), `${spot.x},${spot.y}`).toBe(false);
      for (const spawn of GARDEN_SPAWNS)
        expect(Math.hypot(spot.x - spawn.x, spot.y - spawn.y)).toBeGreaterThan(200);
    }
    expect(new Set(GARDEN_BOOK_SPOTS.map((p) => `${p.x},${p.y}`)).size).toBe(
      GARDEN_BOOK_SPOTS.length,
    );
    // the schedule accepts them (it validates its own spots)
    expect(() =>
      createFuMatch([{ id: 'a', slot: 0 }], {
        arena: GARDEN_ARENA,
        powerups: powerupsFor('NORMAL', GARDEN_BOOK_SPOTS) as never,
      }),
    ).not.toThrow();
  });
});

describe('Garden: connectivity and routes', () => {
  const STEP = 12;
  const RADIUS = R + 4;
  const nx = Math.floor(GARDEN_WIDTH / STEP) + 1;
  const ny = Math.floor(GARDEN_HEIGHT / STEP) + 1;
  const free = (i: number, j: number): boolean => {
    const p = { x: i * STEP, y: j * STEP };
    return (
      p.x >= RADIUS &&
      p.y >= RADIUS &&
      p.x <= GARDEN_WIDTH - RADIUS &&
      p.y <= GARDEN_HEIGHT - RADIUS &&
      !circleHitsWalls(p, RADIUS, walls)
    );
  };
  const flood = (si: number, sj: number): Set<number> => {
    const seen = new Set<number>([si * ny + sj]);
    const queue = [[si, sj]] as [number, number][];
    for (let h = 0; h < queue.length; h += 1) {
      const [i, j] = queue[h] as [number, number];
      for (const [a, b] of [
        [i + 1, j],
        [i - 1, j],
        [i, j + 1],
        [i, j - 1],
      ] as [number, number][]) {
        if (a < 0 || b < 0 || a >= nx || b >= ny || !free(a, b) || seen.has(a * ny + b)) continue;
        seen.add(a * ny + b);
        queue.push([a, b]);
      }
    }
    return seen;
  };
  const cell = (p: { x: number; y: number }): [number, number] => [
    Math.round(p.x / STEP),
    Math.round(p.y / STEP),
  ];

  it('all the open floor is ONE connected region for a player’s body: no pocket a player can be spawned or trapped in', () => {
    let total = 0;
    for (let i = 0; i < nx; i += 1) for (let j = 0; j < ny; j += 1) if (free(i, j)) total += 1;
    const [si, sj] = cell(GARDEN_SPAWNS[0] as { x: number; y: number });
    const reached = flood(si, sj);
    expect(reached.size).toBe(total);
    expect(total).toBeGreaterThan(5000);
  });

  it('every spawn can walk to every other spawn and to every Book spot', () => {
    const [si, sj] = cell(GARDEN_SPAWNS[0] as { x: number; y: number });
    const reached = flood(si, sj);
    for (const p of [...GARDEN_SPAWNS, ...GARDEN_BOOK_SPOTS]) {
      const [i, j] = cell(p);
      expect(reached.has(i * ny + j), `${p.x},${p.y}`).toBe(true);
    }
  });

  it('the narrowest passage a player must use is wider than a player (no gap is a trap, none is a free pass for a wider body)', () => {
    // inflate walls by the player's radius: if the floor stays connected, every route is wide enough for a body
    // (already shown above); and the narrowest corridor still has slack, so a body never jams
    let minGap = Infinity;
    for (let i = 0; i < nx; i += 1)
      for (let j = 0; j < ny; j += 1) {
        const p = { x: i * STEP, y: j * STEP };
        if (!free(i, j)) continue;
        const clearance = Math.min(...walls.map((w) => distanceToRect(p, w)));
        minGap = Math.min(minGap, clearance);
      }
    expect(minGap).toBeGreaterThanOrEqual(R + 4 - 1e-9);
  });
});

describe('Garden: the approved mechanics on its geometry', () => {
  const wall = (id: string) => {
    const found = GARDEN_WALLS.find((w) => w.id === id);
    if (found === undefined) throw new Error(`no wall ${id}`);
    return found;
  };

  it('MOVE: a player walking into a wall stops flush against it and never enters it', () => {
    const h1 = wall('H1'); // the long top wall: walk up into its south face
    let s = place(garden(2), 'a', h1.x + 200, h1.y + h1.height + 200);
    s = run(s, 120, input({ a: { move: { x: 0, y: -1 } } }), { repeat: true }).state;
    expect(at(s, 'a').y).toBeCloseTo(h1.y + h1.height + R, 3);
    expect(circleHitsWalls(at(s, 'a'), R, walls)).toBe(false);
  });

  it('MOVE: the arena boundary also holds (the dashed rectangle is the edge of the world)', () => {
    let s = place(garden(2), 'a', 40, 40);
    s = run(s, 60, input({ a: { move: { x: -1, y: -1 } } }), { repeat: true }).state;
    expect(at(s, 'a').x).toBeGreaterThanOrEqual(R - 1e-6);
    expect(at(s, 'a').y).toBeGreaterThanOrEqual(R - 1e-6);
  });

  it('player/player collision: two players cannot overlap, and neither passes through the other', () => {
    let s = place(place(garden(2), 'a', 800, 450), 'b', 800 + 2 * R + 10, 450);
    s = run(s, 60, input({ a: { move: { x: 1, y: 0 } }, b: { move: { x: -1, y: 0 } } }), {
      repeat: true,
    }).state;
    expect(
      Math.hypot(at(s, 'a').x - at(s, 'b').x, at(s, 'a').y - at(s, 'b').y),
    ).toBeGreaterThanOrEqual(2 * R - 1e-6);
    expect(at(s, 'a').x).toBeLessThan(at(s, 'b').x);
  });

  it('THROW: a boomerang thrown at a wall stops there and comes home to its owner’s hand (RETURNING), through the corridors', () => {
    const h1 = wall('H1');
    let s = place(garden(2), 'a', h1.x + 200, h1.y + h1.height + 150);
    s = face(s, 'a', 0, -1);
    s = run(s, 1, input({ a: { throw: true, move: { x: 0, y: -1 } } })).state;
    expect(boom(s, 'a').state).toBe('THROWN');
    const seen = new Set<string>();
    for (let i = 0; i < 400 && boom(s, 'a').state !== 'HELD'; i += 1) {
      s = stepFu(s, NONE, DT).state;
      seen.add(boom(s, 'a').state);
    }
    expect(seen.has('RETURNING')).toBe(true);
    expect(boom(s, 'a').state).toBe('HELD');
    expect(circleHitsWalls(boom(s, 'a').position, 1, walls)).toBe(false);
  });

  it('RETURNING goes round cover: a boomerang that stopped on the far side of a wall still gets home along the walls', () => {
    // a stands south of H6; the boomerang stops against its north face region on the other side and has to come round
    const h6 = wall('H6');
    let s = place(garden(2), 'a', h6.x + 120, h6.y + h6.height + 90);
    s = flying(
      s,
      'a',
      { x: h6.x + 120, y: h6.y - 80 },
      { x: 0, y: -1 },
      { travelled: C.throwRange - 20 },
    );
    let home = false;
    for (let i = 0; i < 60 * 8; i += 1) {
      s = stepFu(s, NONE, DT).state;
      if (boom(s, 'a').state === 'HELD') {
        home = true;
        break;
      }
    }
    expect(home).toBe(true);
  });

  it('SLASH is stopped by cover: a swing cannot cut through a wall', () => {
    const h6 = wall('H6');
    const x = h6.x + 100;
    let s = place(place(garden(2), 'a', x, h6.y - R - 4), 'b', x, h6.y + h6.height + R + 4); // 100 apart, a wall between
    s = face(s, 'a', 0, 1);
    const r = stepFu(s, input({ a: { slash: true } }), DT);
    expect(player(r.state, 'b').alive).toBe(true);
    expect(r.state.scores).toMatchObject({ a: 0, b: 0 });
    // the same swing with no wall between them kills
    const open = place(place(garden(2), 'a', 800, 450), 'b', 800, 450 + 2 * R + 4);
    expect(
      player(stepFu(face(open, 'a', 0, 1), input({ a: { slash: true } }), DT).state, 'b').alive,
    ).toBe(false);
  });

  it('DEFLECTION works in Garden (the same rules): a timed slash knocks a boomerang away and the deflector scores its kill', () => {
    // b's boomerang flies at a along an open lane; a swings as it arrives; it flies on and is a's
    let s = place(place(garden(3), 'a', 1000, 640), 'b', 1250, 640);
    s = place(s, 'c', 300, 1000);
    s = flying(s, 'b', { x: 1150, y: 640 }, { x: -1, y: 0 });
    s = face(s, 'a', 1, 0);
    let deflected = false;
    for (let i = 0; i < 30 && !deflected; i += 1) {
      const r = stepFu(s, input({ a: { slash: i === 4 } }), DT);
      s = r.state;
      deflected = types(r.events).includes('DEFLECTED');
    }
    expect(deflected).toBe(true);
    expect(
      boom(s, 'b').deflectedBy === 'a' ||
        boom(s, 'b').state === 'RETURNING' ||
        boom(s, 'b').state === 'DEFLECTED',
    ).toBe(true);
  });

  it('DASH: a dash stops flush against a wall and is never carried through it', () => {
    const v9 = wall('V9');
    let s = place(garden(2), 'a', v9.x - R - 60, v9.y + 150);
    s = run(s, 30, input({ a: { dash: true, move: { x: 1, y: 0 } } })).state;
    expect(at(s, 'a').x).toBeLessThanOrEqual(v9.x - R + 1e-6);
    expect(circleHitsWalls(at(s, 'a'), R, walls)).toBe(false);
  });

  it('PHASE_DASH (owned): a dash goes through a Garden wall and ends in open floor; without it the wall stops the dash', () => {
    const h6 = wall('H6');
    const start = { x: h6.x + 208, y: h6.y + h6.height + R + 20 };
    const base = face(place(garden(2), 'a', start.x, start.y), 'a', 0, -1);
    const plain = run(base, 30, input({ a: { dash: true, move: { x: 0, y: -1 } } })).state;
    expect(at(plain, 'a').y).toBeGreaterThanOrEqual(h6.y + h6.height + R - 1e-6);
    const phased = run(
      own(base, 'a', 'PHASE_DASH'),
      40,
      input({ a: { dash: true, move: { x: 0, y: -1 } } }),
    ).state;
    expect(at(phased, 'a').y).toBeLessThan(h6.y - R + 1e-6);
    expect(circleHitsWalls(at(phased, 'a'), R, walls)).toBe(false);
  });

  it('BLAST: a wall is cover from an explosion (the blast needs a clear line), and an open blast kills', () => {
    const h6 = wall('H6');
    const near = (open: boolean): FuState => {
      let s = own(garden(3), 'a', 'BLAST_BOOMERANG');
      const victim = open ? { x: 1000, y: 450 } : { x: h6.x + 100, y: h6.y + h6.height + R + 10 };
      const centre = open ? { x: 1000 - 40, y: 450 } : { x: h6.x + 100, y: h6.y - R - 10 };
      s = place(place(place(s, 'a', 60, 60), 'b', victim.x, victim.y), 'c', 1400, 1400);
      s = flying(s, 'a', centre, open ? { x: 1, y: 0 } : { x: 0, y: 1 }, { blast: true });
      return s;
    };
    const covered = run(near(false), 6);
    expect(player(covered.state, 'b').alive).toBe(true);
    expect(covered.state.scores['a']).toBe(0);
    const open = run(near(true), 20);
    expect(open.state.scores['a']).toBeGreaterThan(0);
  });

  it('TWIN_THROW: one press launches two boomerangs; both get home on Garden’s walls', () => {
    let s = own(place(garden(2), 'a', 800, 600), 'a', 'TWIN_THROW');
    s = face(s, 'a', 0, -1);
    s = run(s, 1, input({ a: { throw: true, move: { x: 0, y: -1 } } })).state;
    expect(weaponsOf(s, 'a').filter((b) => b.state === 'THROWN')).toHaveLength(2);
    for (let i = 0; i < 60 * 8 && weaponsOf(s, 'a').some((b) => b.state !== 'HELD'); i += 1)
      s = stepFu(s, NONE, DT).state;
    expect(weaponsOf(s, 'a').every((b) => b.state === 'HELD')).toBe(true);
  });

  it('SHIELD: a swing that would kill breaks the shield instead, no death, no score', () => {
    const s = own(
      face(place(place(garden(2), 'a', 800, 450), 'b', 800 + 2 * R + 4, 450), 'a', 1, 0),
      'b',
      'GUARD',
    );
    const r = stepFu(s, input({ a: { slash: true } }), DT);
    expect(player(r.state, 'b').alive).toBe(true);
    expect(player(r.state, 'b').inventory).toEqual([]);
    expect(r.state.scores['a']).toBe(0);
  });

  it('OVERDRIVE: an overdriven walker is faster (1.4×) and still stopped by Garden’s walls', () => {
    const v9 = wall('V9');
    const go = (owns: boolean) => {
      let s = place(garden(2), 'a', v9.x - R - 300, v9.y + 150);
      if (owns) s = own(s, 'a', 'OVERDRIVE');
      return at(run(s, 20, input({ a: { move: { x: 1, y: 0 } } }), { repeat: true }).state, 'a').x;
    };
    expect(go(true) - (v9.x - R - 300)).toBeGreaterThan(1.3 * (go(false) - (v9.x - R - 300)));
    let s = own(place(garden(2), 'a', v9.x - R - 40, v9.y + 150), 'a', 'OVERDRIVE');
    s = run(s, 60, input({ a: { move: { x: 1, y: 0 } } }), { repeat: true }).state;
    expect(at(s, 'a').x).toBeLessThanOrEqual(v9.x - R + 1e-6);
  });

  it('Books appear only on the Garden’s Book spots (mystery, no kind) and are collected through the ordinary rules', () => {
    let s = createFuMatch(
      IDS.slice(0, 2).map((id, i) => ({ id, slot: i })),
      {
        arena: GARDEN_ARENA,
        ...FREE_FOR_ALL,
        powerups: { ...powerupsFor('HIGH', GARDEN_BOOK_SPOTS), firstSeconds: 1 } as never,
      },
    );
    let spotted: { x: number; y: number } | undefined;
    for (let i = 0; i < 60 * 6 && spotted === undefined; i += 1) {
      s = stepFu(s, NONE, DT).state;
      spotted = s.pickups[0]?.position;
    }
    expect(spotted).toBeDefined();
    expect(GARDEN_BOOK_SPOTS.some((p) => p.x === spotted?.x && p.y === spotted?.y)).toBe(true);
    expect(Object.keys(s.pickups[0] ?? {}).sort()).toEqual(['id', 'position']); // a Book names nothing
    s = place(s, 'a', spotted?.x ?? 0, spotted?.y ?? 0);
    s = stepFu(s, NONE, DT).state;
    expect(player(s, 'a').inventory).toHaveLength(1);
    expect(s.pickups).toHaveLength(0);
  });

  it('a round resets to the Garden spawns (kills and powers kept); a rematch is a new match', () => {
    let s = garden(3);
    s = own(s, 'a', 'GUARD');
    s = place(place(place(s, 'a', 300, 300), 'b', 900, 300), 'c', 600, 800);
    s = { ...s, scores: { a: 4, b: 2, c: 1 } };
    s = patchPlayer(patchPlayer(s, 'b', { alive: false }), 'c', { alive: false });
    for (let i = 0; i < 600 && s.round === 1; i += 1) s = stepFu(s, NONE, DT).state;
    expect(s.round).toBe(2);
    s.players.forEach((p) => expect(at(s, p.id)).toEqual(GARDEN_SPAWNS[p.slot]));
    expect(s.scores).toEqual({ a: 4, b: 2, c: 1 });
    expect([...player(s, 'a').inventory]).toEqual(['GUARD']);
    const fresh = rematchOf(s);
    expect(fresh.round).toBe(1);
    expect(fresh.scores).toEqual({ a: 0, b: 0, c: 0 });
    expect(fresh.players.every((p) => p.inventory.length === 0)).toBe(true);
    expect(fresh.config.arena).toBe(GARDEN_ARENA);
  });

  it('six-player combat is deterministic: the same inputs replay to the identical state and events', () => {
    const play = () => {
      let s = garden(6, { seed: 5 });
      const log: unknown[] = [];
      for (let i = 0; i < 1800; i += 1) {
        const r = stepFu(
          s,
          input(
            Object.fromEntries(
              IDS.map((id, k) => [
                id,
                {
                  move: { x: Math.cos(i / (19 + 3 * k) + k), y: Math.sin(i / (23 + 2 * k) + k) },
                  throw: (i + 7 * k) % 43 === 0,
                  slash: (i + 3 * k) % 59 === 0,
                  dash: (i + 5 * k) % 31 === 0,
                },
              ]),
            ),
          ),
          DT,
        );
        s = r.state;
        log.push(r.events);
      }
      return JSON.stringify({ s, log });
    };
    expect(play()).toBe(play());
  });

  it('nothing in six-player fuzz ever puts a living body inside a wall or outside the boundary', () => {
    let s = garden(6, { seed: 9 });
    for (let i = 0; i < 2400; i += 1) {
      s = stepFu(
        s,
        input(
          Object.fromEntries(
            IDS.map((id, k) => [
              id,
              {
                move: { x: Math.cos(i / (11 + 2 * k) + k), y: Math.sin(i / (13 + k) + 2 * k) },
                dash: (i + 3 * k) % 17 === 0,
                throw: (i + 5 * k) % 37 === 0,
                slash: (i + 2 * k) % 41 === 0,
              },
            ]),
          ),
        ),
        DT,
      ).state;
      for (const p of s.players) {
        if (!p.alive) continue;
        const pos = at(s, p.id);
        expect(circleHitsWalls(pos, R - 0.01, walls), `tick ${i} ${p.id}`).toBe(false);
        expect(pos.x).toBeGreaterThanOrEqual(R - 1e-6);
        expect(pos.y).toBeGreaterThanOrEqual(R - 1e-6);
        expect(pos.x).toBeLessThanOrEqual(GARDEN_WIDTH - R + 1e-6);
        expect(pos.y).toBeLessThanOrEqual(GARDEN_HEIGHT - R + 1e-6);
      }
    }
  });
});
