import { describe, expect, it } from 'vitest';
import { stepFu, zoneOf } from '../src/rules';
import { BATTLE_ROYALE_HOLD, BATTLE_ROYALE_SHRINK } from '../src/rules/battleRoyale';
import { C, DT, NONE, at, input, make, place, player, type FuState } from './support/fixtures';

// BATTLE_ROYALE — the reference video (art/physics_reference/README.md, "Battle Royale"): 4:37.6 the banana takes it; at once
// the border (the dashed line) starts closing in on the arena's middle, every side, ≈ 0.6 plank-widths a second across
// (4:37.7–4:46.0); a player left outside explodes (4:46.4) — the arena's own out-of-bounds rule. It is not kept: nobody shows
// it at a later round's start. A new round starts with the full arena.

const ZONE = { x: 100, y: 100, width: 1400, height: 700 };

function royale(): FuState {
  let s = make(['a', 'b'], { arena: { width: 1600, height: 900, walls: [], safeZone: ZONE } });
  s = place(place(s, 'a', 800, 450), 'b', 1200, 450);
  // a Book at Alice's feet that can only award BATTLE_ROYALE
  return {
    ...s,
    config: { ...s.config, enabledPowers: ['BATTLE_ROYALE'] },
    pickups: [{ id: 1, position: at(s, 'a') }],
  };
}

describe('Battle Royale', () => {
  it('closes in at the measured speed, every side', () => {
    expect(BATTLE_ROYALE_SHRINK).toBeCloseTo(121, 9);
  });

  it('the border holds 0.9 s (the video: the dashed line appears at 4:37.94), then closes; it is not kept', () => {
    expect(BATTLE_ROYALE_HOLD).toBeCloseTo(0.9, 9);
    const r = stepFu(royale(), NONE, DT);
    expect(r.events.some((e) => e.type === 'PICKED_UP' && e.kind === 'BATTLE_ROYALE')).toBe(true);
    expect(player(r.state, 'a').inventory).toEqual([]);
    let s = r.state;
    for (let i = 0; i < 50; i += 1) s = stepFu(s, NONE, DT).state; // still holding
    expect(zoneOf(s)).toEqual(ZONE);
    for (let i = 0; i < 64; i += 1) s = stepFu(s, NONE, DT).state; // the hold, then one second of closing
    const z = zoneOf(s) as typeof ZONE;
    const d = BATTLE_ROYALE_SHRINK * (1 + 115 * DT - BATTLE_ROYALE_HOLD - 1);
    expect(z.x).toBeCloseTo(ZONE.x + d, 0);
    expect(z.y).toBeCloseTo(ZONE.y + d, 0);
    expect(z.width).toBeCloseTo(ZONE.width - 2 * d, 0);
    expect(z.height).toBeCloseTo(ZONE.height - 2 * d, 0);
  });

  it('without it the border never moves', () => {
    let s: FuState = { ...royale(), pickups: [] };
    for (let i = 0; i < 120; i += 1) s = stepFu(s, NONE, DT).state;
    expect(zoneOf(s)).toEqual(ZONE);
  });

  it('a player the border has passed is outside: the out-of-bounds clock runs and, at its limit, they explode', () => {
    let s = place(royale(), 'b', 1440, 450); // 60 u inside the right edge
    s = stepFu(s, NONE, DT).state; // Alice takes it
    let exploded = false;
    for (let i = 0; i < 60 * (2 + C.outsideLimitSeconds) && !exploded; i += 1) {
      const r = stepFu(s, NONE, DT);
      s = r.state;
      exploded = r.events.some(
        (e) => e.type === 'HIT' && e.victimId === 'b' && e.source === 'OUT_OF_BOUNDS',
      );
    }
    expect(exploded).toBe(true);
    expect(player(s, 'a').alive).toBe(true); // Alice, in the middle, is still inside
  });

  it('it stops at the middle: never smaller than nothing', () => {
    let s = stepFu(royale(), NONE, DT).state;
    s = { ...s, roundTime: s.roundTime + 60 };
    const z = zoneOf(s) as typeof ZONE;
    expect(z.width).toBeGreaterThanOrEqual(0);
    expect(z.height).toBeGreaterThanOrEqual(0);
    expect(z.x + z.width / 2).toBeCloseTo(ZONE.x + ZONE.width / 2, 6);
    expect(z.y + z.height / 2).toBeCloseTo(ZONE.y + ZONE.height / 2, 6);
  });

  it('a second Battle Royale while it closes changes nothing', () => {
    let s = stepFu(royale(), NONE, DT).state;
    for (let i = 0; i < 90; i += 1) s = stepFu(s, NONE, DT).state;
    const before = zoneOf(s);
    s = { ...s, pickups: [{ id: 2, position: at(s, 'a') }] };
    const r = stepFu(s, NONE, DT);
    expect(r.events.some((e) => e.type === 'PICKED_UP')).toBe(true);
    expect((zoneOf(r.state) as typeof ZONE).width).toBeCloseTo(
      (before as typeof ZONE).width - 2 * BATTLE_ROYALE_SHRINK * DT,
      6,
    );
  });

  it('a new round starts with the full arena', () => {
    let s = stepFu(royale(), NONE, DT).state;
    s = { ...s, players: s.players.map((p) => (p.id === 'b' ? { ...p, alive: false } : p)) };
    for (let i = 0; i < 600 && s.round === 1; i += 1) s = stepFu(s, NONE, DT).state;
    expect(s.round).toBe(2);
    expect(zoneOf(s)).toEqual(ZONE);
  });

  it('it needs an arena with a border: elsewhere it is never awarded', () => {
    let s = make(['a', 'b'], { arena: { width: 1600, height: 900, walls: [] } });
    s = place(s, 'a', 800, 450);
    s = {
      ...s,
      config: { ...s.config, enabledPowers: ['BATTLE_ROYALE'] },
      pickups: [{ id: 1, position: at(s, 'a') }],
    };
    const r = stepFu(s, input({}), DT);
    expect(r.events.some((e) => e.type === 'PICKED_UP')).toBe(false);
  });
});
