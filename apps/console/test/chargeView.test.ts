import { DEFAULT_FU_CONFIG as C, createFuMatch, type FuState } from '@foomerang/foomerang-fu';
import type { RosterEntry } from '@foomerang/protocol';
import { describe, expect, it } from 'vitest';
import { buildFuView } from '../src/render/fuView';
import { SlotAllocator } from '../src/runtime/slots';

// Charging a throw, as the TV sees it (owner, 2026-10-19): a charging player shows an aim line as long as the throw would fly
// (it grows with the charge), and each boomerang in flight carries the power it was thrown with (a full charge gets the pink
// trail). Rules facts, drawn; the renderer decides nothing.

const roster: RosterEntry[] = [
  { playerId: 'a', displayName: 'Alvin', connection: 'CONNECTED', seat: 'HELD' },
  { playerId: 'b', displayName: 'David', connection: 'CONNECTED', seat: 'HELD' },
];
const slots = () => {
  const s = new SlotAllocator();
  s.sync(roster.map((e) => ({ playerId: e.playerId, seated: true })));
  return s;
};
const base = (): FuState =>
  createFuMatch([
    { id: 'a', slot: 0 },
    { id: 'b', slot: 3 },
  ]);
const charging = (seconds: number): FuState => {
  const s = base();
  return {
    ...s,
    players: s.players.map((p) =>
      p.id === 'a' ? { ...p, charge: { phase: 'CHARGING', seconds } } : p,
    ),
  };
};

describe('buildFuView: charging and charged throws', () => {
  it('nobody charging: no aim line', () => {
    expect(buildFuView(base(), [], roster, slots()).circles.map((c) => c.aim)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it('a charging player aims: power so far and how far the throw would fly', () => {
    const half = buildFuView(charging(C.fullChargeSeconds / 2), [], roster, slots()).circles[0]
      ?.aim;
    expect(half?.power).toBeCloseTo(0.5, 9);
    expect(half?.reach).toBeCloseTo((C.throwRange + C.chargedThrowRange) / 2, 6);
    const full = buildFuView(charging(5), [], roster, slots()).circles[0]?.aim;
    expect(full).toEqual({ power: 1, reach: C.chargedThrowRange });
  });

  it('a boomerang in flight carries its power', () => {
    const s = base();
    const flying: FuState = {
      ...s,
      boomerangs: s.boomerangs.map((b) =>
        b.ownerId === 'a'
          ? {
              ...b,
              state: 'THROWN',
              position: { x: 600, y: 450 },
              direction: { x: 1, y: 0 },
              power: 1,
            }
          : b,
      ),
    };
    expect(buildFuView(flying, [], roster, slots()).boomerangs.map((b) => [b.id, b.power])).toEqual(
      [['a', 1]],
    );
  });
});

describe('buildFuView: ricochets', () => {
  it('a RICOCHET becomes a drawable event at the bounce, naming whose boomerang it was', () => {
    const view = buildFuView(
      base(),
      [
        {
          type: 'RICOCHET',
          ownerId: 'a',
          position: { x: 786, y: 450 },
          direction: { x: -1, y: 0 },
        },
      ],
      roster,
      slots(),
    );
    expect(view.events).toEqual([
      expect.objectContaining({ type: 'RICOCHET', x: 786, y: 450, ownerId: 'a' }),
    ]);
  });
});
