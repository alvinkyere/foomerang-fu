import { describe, expect, it } from 'vitest';
import { hidingSolids } from '../src/render/garden/occlusion';

const box = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });

// The readability rule: a solid fades only while it is IN FRONT of a living person and covers their silhouette.
describe('Garden occlusion', () => {
  const person = (x: number, feetY: number) => ({
    depth: feetY,
    box: box(x - 40, feetY - 100, x + 40, feetY + 8),
  });

  it('a wall in front of someone and overlapping them hides them; a wall behind them, or beside them, does not', () => {
    const inFront = { depth: 400, box: box(100, 330, 300, 420) };
    const behind = { depth: 300, box: box(100, 240, 300, 330) };
    const beside = { depth: 400, box: box(500, 330, 700, 420) };
    expect(hidingSolids([inFront, behind, beside], [person(200, 350)])).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('only the solids that hide someone fade, not every wall: with six people spread out, most of the arena stays solid', () => {
    const solids = Array.from({ length: 60 }, (_, i) => ({
      depth: 120 + i * 15,
      box: box((i % 10) * 190, 80 + i * 15, (i % 10) * 190 + 180, 130 + i * 15),
    }));
    const people = [
      person(150, 300),
      person(900, 600),
      person(1500, 900),
      person(400, 700),
      person(1200, 200),
      person(1700, 500),
    ];
    const hiding = hidingSolids(solids, people);
    expect(hiding.some(Boolean)).toBe(true);
    expect(hiding.filter(Boolean).length).toBeLessThan(solids.length / 3);
  });

  it('someone standing against a wall (a hair behind its depth) is not treated as hidden by it', () => {
    const wall = { depth: 400.5, box: box(100, 330, 300, 420) };
    expect(hidingSolids([wall], [person(200, 400)])).toEqual([false]);
  });

  it('a person who is not there (dead: the caller leaves them out) hides nothing', () => {
    expect(hidingSolids([{ depth: 400, box: box(0, 0, 999, 999) }], [])).toEqual([false]);
  });

  it('several people behind one boulder: it fades while ANY of them is covered', () => {
    const rock = { depth: 500, box: box(300, 380, 520, 520) };
    expect(hidingSolids([rock], [person(900, 300), person(400, 420)])).toEqual([true]);
  });
});
