import { describe, expect, it } from 'vitest';
import { stepFu, zoneOf } from '../src/rules';
import {
  BATTLE_ROYALE_FINAL,
  BATTLE_ROYALE_HOLD,
  BATTLE_ROYALE_SHRINK,
  finalBox,
} from '../src/rules/battleRoyale';
import { MARKET_PLAZA_ARENA } from '../src/rules';
import { distanceToSolid, wallsOf } from '../src/rules/arena';
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
    const d = BATTLE_ROYALE_SHRINK * (s.roundTime - (s.closingSince ?? 0) - BATTLE_ROYALE_HOLD);
    expect(d).toBeGreaterThan(BATTLE_ROYALE_SHRINK * 0.95); // about a second of closing
    expect(z.x).toBeCloseTo(ZONE.x + d, 0);
    expect(z.width).toBeCloseTo(ZONE.width - 2 * d, 0);
    // top and bottom have already reached the final box (456 of the 700 tall border) and stopped there
    expect(d).toBeGreaterThan((ZONE.height - BATTLE_ROYALE_FINAL) / 2);
    expect(z.y).toBeCloseTo(ZONE.y + (ZONE.height - BATTLE_ROYALE_FINAL) / 2, 6);
    expect(z.height).toBeCloseTo(BATTLE_ROYALE_FINAL, 6);
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

  it('it does not close completely: it stops at a box people can move in (the owner, 2026-10-21: the video never shows the end)', () => {
    expect(BATTLE_ROYALE_FINAL).toBe(456); // 6 character widths
    let s = stepFu(royale(), NONE, DT).state;
    s = { ...s, roundTime: s.roundTime + 60 };
    const z = zoneOf(s) as typeof ZONE;
    expect(z.width).toBeCloseTo(BATTLE_ROYALE_FINAL, 6);
    expect(z.height).toBeCloseTo(BATTLE_ROYALE_FINAL, 6);
    // an open arena: the box is in the middle
    expect(z.x + z.width / 2).toBeCloseTo(ZONE.x + ZONE.width / 2, 0);
    expect(z.y + z.height / 2).toBeCloseTo(ZONE.y + ZONE.height / 2, 0);
  });

  it('on the plaza the box is centred where people can stand, not on the fountain, and is mostly free floor', () => {
    const box = finalBox(MARKET_PLAZA_ARENA);
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const solids = wallsOf(MARKET_PLAZA_ARENA);
    // a body fits at its centre
    for (const w of solids) expect(distanceToSolid(centre, w)).toBeGreaterThan(36);
    // and most of the box is floor a body can stand on
    let free = 0;
    let all = 0;
    for (let x = box.x + 19; x < box.x + box.width; x += 38)
      for (let y = box.y + 19; y < box.y + box.height; y += 38) {
        all += 1;
        if (solids.every((w) => distanceToSolid({ x, y }, w) > 36)) free += 1;
      }
    expect(free / all).toBeGreaterThan(0.7);
    // inside the border
    const zone = MARKET_PLAZA_ARENA.safeZone as typeof ZONE;
    expect(box.x).toBeGreaterThanOrEqual(zone.x);
    expect(box.x + box.width).toBeLessThanOrEqual(zone.x + zone.width);
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
