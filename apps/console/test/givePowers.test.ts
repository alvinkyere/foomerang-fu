import { describe, expect, it } from 'vitest';
import { FuRuntime } from '../src/runtime/fuRuntime';
import { parseGiveParam } from '../src/runtime/powerupMode';

// Testing a power (owner, 2026-11-06: "make it possible to test explosive boomerang"): ?give=EXPLOSIVE_BOOMERANG starts every player
// of the match holding it, so it can be thrown from the first second (with ?enable= the Books give it too).

describe('?give= (a developer switch)', () => {
  it('reads power names, ignores anything else, and is absent without them', () => {
    expect(parseGiveParam('?give=EXPLOSIVE_BOOMERANG')).toEqual(['EXPLOSIVE_BOOMERANG']);
    expect(parseGiveParam('?give=EXPLOSIVE_BOOMERANG,NOPE')).toEqual(['EXPLOSIVE_BOOMERANG']);
    expect(parseGiveParam('?give=NOPE')).toBeUndefined();
    expect(parseGiveParam('?arena=glade')).toBeUndefined();
  });

  it('starts a match with every player holding what it gives', () => {
    const rt = new FuRuntime(
      undefined,
      'off',
      undefined,
      'FREE_FOR_ALL',
      undefined,
      0,
      () => 0.5,
      false,
      ['EXPLOSIVE_BOOMERANG'],
    );
    rt.start(
      [
        { playerId: 'a', slot: 0 },
        { playerId: 'b', slot: 1 },
      ] as never,
      0,
    );
    for (const p of rt.state?.players ?? []) expect(p.inventory).toEqual(['EXPLOSIVE_BOOMERANG']);
    expect(rt.state?.players).toHaveLength(2);
  });
});
