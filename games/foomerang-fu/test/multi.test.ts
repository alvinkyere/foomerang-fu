import { describe, expect, it } from 'vitest';
import { stepFu } from '../src/rules';
import { MULTI_PIECES, MULTI_SPREAD_RADIANS, splitDirections } from '../src/rules/multi';
import {
  C,
  DT,
  NONE,
  boom,
  face,
  give,
  input,
  make,
  place,
  player,
  run,
  weaponsOf,
  type FuState,
  STRAIGHT,
} from './support/fixtures';

// MULTI_BOOMERANG — the reference video (art/physics_reference/README.md, "Multi boomerang"): the throw flies out as ONE
// boomerang; at its first enemy contact, or where its flight out ends, it splits into six, 44° apart, fanned about its heading
// (5:51.71; 6:50.6). Each piece is lethal, flies out as a plain throw and curls home, and vanishes when caught; the boomerang that
// split is out of play (SPENT) until its last piece is gone, then back in hand. They carry the throw's other powers.

const THROW = input({ a: { throw: true } });
const deg = (r: number) => (r * 180) / Math.PI;
const angle = (v: { x: number; y: number }) => deg(Math.atan2(v.y, v.x));

/** Alice at (300,450) facing right with MULTI_BOOMERANG; Bob out of the way. */
function multi(): FuState {
  const s = place(place(make(['a', 'b'], STRAIGHT), 'a', 300, 450), 'b', 1500, 850);
  return face(give(s, 'a', 'MULTI_BOOMERANG'), 'a', 1, 0);
}

describe('the fan (measured)', () => {
  it('six, 44° apart, symmetric about the heading (±22°, ±66°, ±110°)', () => {
    expect(MULTI_PIECES).toBe(6);
    expect(deg(MULTI_SPREAD_RADIANS)).toBeCloseTo(44, 9);
    const dirs = splitDirections({ x: 1, y: 0 });
    expect(dirs.map((d) => Math.round(angle(d)))).toEqual([-110, -66, -22, 22, 66, 110]);
  });
});

describe('a Multi throw', () => {
  it('leaves as ONE boomerang', () => {
    const r = stepFu(multi(), THROW, DT);
    expect(r.events.filter((e) => e.type === 'THROWN')).toHaveLength(1);
    expect(weaponsOf(r.state, 'a')).toHaveLength(1);
    expect(boom(r.state, 'a').split).toBe(true);
  });

  it('where its flight out ends it splits into six, fanned about its heading, with a SPLIT event', () => {
    let s = stepFu(multi(), THROW, DT).state;
    const steps = Math.ceil(C.throwRange / (C.throwSpeed * DT)) + 2;
    let split: { position: { x: number; y: number } } | undefined;
    for (let i = 0; i < steps && split === undefined; i += 1) {
      const r = stepFu(s, NONE, DT);
      s = r.state;
      split = r.events.find((e) => e.type === 'SPLIT') as typeof split;
    }
    expect(split).toBeDefined();
    expect(split?.position.x).toBeCloseTo(
      300 + C.playerRadius + C.boomerangRadius + 1 + C.throwRange,
      -1,
    );
    const pieces = s.extraBoomerangs.filter((b) => b.ownerId === 'a');
    expect(pieces).toHaveLength(6);
    expect(pieces.every((w) => w.state === 'THROWN' && w.pieceOf === 0 && w.split !== true)).toBe(
      true,
    );
    expect(pieces.map((w) => Math.round(angle(w.direction))).sort((x, y) => x - y)).toEqual([
      -110, -66, -22, 22, 66, 110,
    ]);
    // the boomerang that split is out of play meanwhile
    expect(boom(s, 'a')).toMatchObject({ state: 'SPENT', splitInto: true });
  });

  it('while its pieces fly her boomerang is out of play: she cannot throw, and it is back only after the last piece is gone', () => {
    let s = stepFu(multi(), THROW, DT).state;
    for (let i = 0; i < 200 && boom(s, 'a').state !== 'SPENT'; i += 1)
      s = stepFu(s, NONE, DT).state;
    s = run(s, 5).state;
    expect(boom(s, 'a').state).toBe('SPENT');
    expect(stepFu(s, THROW, DT).events.some((e) => e.type === 'THROWN')).toBe(false);
    for (let i = 0; i < 600 && s.extraBoomerangs.some((b) => b.ownerId === 'a'); i += 1) {
      expect(boom(s, 'a').state).toBe('SPENT');
      s = stepFu(s, NONE, DT).state;
    }
    s = stepFu(s, NONE, DT).state;
    expect(boom(s, 'a').state).toBe('HELD');
  });

  it('on its first enemy contact it kills and splits there', () => {
    let s = place(multi(), 'b', 520, 450);
    const r = run(stepFu(s, THROW, DT).state, 20);
    const hit = r.events.find((e) => e.type === 'HIT');
    expect(hit).toMatchObject({ victimId: 'b', byId: 'a' });
    expect(r.events.some((e) => e.type === 'SPLIT')).toBe(true);
    s = r.state;
    expect(s.extraBoomerangs.filter((b) => b.ownerId === 'a')).toHaveLength(6);
  });

  it('the pieces are lethal', () => {
    // Bob stands where the +66° piece goes, after the split at the end of the flight out
    const end = 300 + C.playerRadius + C.boomerangRadius + 1 + C.throwRange;
    const a66 = (66 * Math.PI) / 180;
    let s = stepFu(multi(), THROW, DT).state;
    s = place(s, 'b', end + Math.cos(a66) * 150, 450 + Math.sin(a66) * 150);
    const r = run(s, 120);
    expect(r.events.filter((e) => e.type === 'HIT')).toEqual([
      expect.objectContaining({ victimId: 'b', byId: 'a' }),
    ]);
  });

  it('they all come home: the pieces vanish as they are caught; then her own is back in hand', () => {
    let s = stepFu(multi(), THROW, DT).state;
    s = run(s, 400).state;
    expect(weaponsOf(s, 'a')).toHaveLength(1);
    expect(boom(s, 'a').state).toBe('HELD');
    expect(s.extraBoomerangs.filter((b) => b.ownerId === 'a')).toHaveLength(0);
    expect(player(s, 'a').alive).toBe(true); // none of them hurt her
  });

  it('a piece never splits again (one split per throw)', () => {
    let s = stepFu(multi(), THROW, DT).state;
    const r = run(s, 400);
    expect(r.events.filter((e) => e.type === 'SPLIT')).toHaveLength(1);
    s = r.state;
    // the next throw splits again
    const again = run(stepFu(s, THROW, DT).state, 120);
    expect(again.events.filter((e) => e.type === 'SPLIT')).toHaveLength(1);
  });

  it('without the power nothing splits', () => {
    const plain = face(
      place(place(make(['a', 'b'], STRAIGHT), 'a', 300, 450), 'b', 1500, 850),
      'a',
      1,
      0,
    );
    const r = run(stepFu(plain, THROW, DT).state, 400);
    expect(r.events.some((e) => e.type === 'SPLIT')).toBe(false);
    expect(weaponsOf(r.state, 'a')).toHaveLength(1);
  });
});

describe('Multi with the other powers', () => {
  it('with EXPLOSIVE every piece is armed', () => {
    let s = give(multi(), 'a', 'EXPLOSIVE_BOOMERANG');
    s = stepFu(s, THROW, DT).state;
    for (let i = 0; i < 200 && !s.extraBoomerangs.some((b) => b.pieceOf !== undefined); i += 1)
      s = stepFu(s, NONE, DT).state;
    const pieces = s.extraBoomerangs.filter((b) => b.pieceOf !== undefined);
    expect(pieces).toHaveLength(6);
    expect(pieces.every((p) => p.blast)).toBe(true);
  });

  it('with EXTRA each boomerang thrown splits on its own', () => {
    let s = give(multi(), 'a', 'EXTRA_BOOMERANG');
    s = stepFu(s, THROW, DT).state;
    s = run(s, 4).state;
    s = stepFu(s, THROW, DT).state;
    const r = run(s, 120);
    expect(r.events.filter((e) => e.type === 'SPLIT')).toHaveLength(2);
  });
});
