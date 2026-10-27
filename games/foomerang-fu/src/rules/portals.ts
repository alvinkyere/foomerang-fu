import type { Vec2 } from '@foomerang/game-core';
import type { Boomerang } from './boomerang';
import type { FuState } from './state';

/**
 * A portal's pad (owner, 2026-10-26: "make it work"): a disc on the ground in front of a portal. The HQ (foomerang-fu
 * physics hq.mp4 9:09.4-9:09.9) shows a player who walks onto one gone the next frame and standing at its partner three
 * frames on; 9:40.0 and ff physics hq 2.mp4 8:05 show a boomerang thrown into one flying on out of its partner.
 */
export interface ArenaPortal {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** The id of its partner, where whatever reaches this pad comes out. */
  readonly to: string;
}

/** Something went through a portal: a player (`playerId`) or a boomerang (`ownerId`), from pad `from` to pad `to`. */
export type PortalEvent =
  | {
      readonly type: 'PORTAL';
      readonly playerId: string;
      readonly from: string;
      readonly to: string;
    }
  | {
      readonly type: 'PORTAL';
      readonly ownerId: string;
      readonly from: string;
      readonly to: string;
    };

const FLYING: ReadonlySet<Boomerang['state']> = new Set(['THROWN', 'RETURNING', 'DEFLECTED']);

const onPad = (p: Vec2, pad: ArenaPortal): boolean =>
  Math.hypot(p.x - pad.x, p.y - pad.y) < pad.radius;

/**
 * After a step's movement: every living player whose middle is on a pad goes to its partner's pad, unless it is the pad they
 * came out on and have not yet left (`portalLocks`: the HQ's eggplant walks off the pad it arrived on, it is not sent back);
 * every flying boomerang on a pad comes out of its partner on the same heading, just past the partner's pad so it flies on.
 */
export function crossPortals(state: FuState): { state: FuState; events: PortalEvent[] } {
  const pads = state.config.arena.portals;
  if (pads === undefined || pads.length === 0) return { state, events: [] };
  const byId = new Map(pads.map((p) => [p.id, p]));
  const events: PortalEvent[] = [];
  const locks: Record<string, string> = {};
  const moved = new Map<string, Vec2>();
  for (const player of state.players) {
    const body = state.world.bodies.find((b) => b.id === player.id);
    if (body === undefined) continue;
    const held = state.portalLocks?.[player.id];
    const heldPad = held === undefined ? undefined : byId.get(held);
    if (heldPad !== undefined && onPad(body.position, heldPad)) {
      locks[player.id] = held as string; // still on the pad they came out on
      continue;
    }
    if (!player.alive) continue;
    const pad = pads.find((p) => onPad(body.position, p));
    const out = pad === undefined ? undefined : byId.get(pad.to);
    if (pad === undefined || out === undefined) continue;
    moved.set(player.id, { x: out.x, y: out.y });
    locks[player.id] = out.id;
    events.push({ type: 'PORTAL', playerId: player.id, from: pad.id, to: out.id });
  }
  const through = (b: Boomerang): Boomerang => {
    if (!FLYING.has(b.state)) return b;
    const pad = pads.find((p) => onPad(b.position, p));
    const out = pad === undefined ? undefined : byId.get(pad.to);
    if (pad === undefined || out === undefined) return b;
    // just past the partner's pad, along its heading: it flies on away from it
    const past = out.radius + state.config.boomerangRadius + 1;
    events.push({ type: 'PORTAL', ownerId: b.ownerId, from: pad.id, to: out.id });
    return Object.freeze({
      ...b,
      position: { x: out.x + b.direction.x * past, y: out.y + b.direction.y * past },
    });
  };
  const boomerangs = state.boomerangs.map(through);
  const extraBoomerangs = state.extraBoomerangs.map(through);
  const lockCount = Object.keys(locks).length;
  if (events.length === 0 && lockCount === Object.keys(state.portalLocks ?? {}).length)
    return { state, events };
  const { portalLocks: _old, ...rest } = state;
  void _old;
  return {
    state: Object.freeze({
      ...rest,
      world:
        moved.size === 0
          ? state.world
          : Object.freeze({
              ...state.world,
              bodies: Object.freeze(
                state.world.bodies.map((b) => {
                  const to = moved.get(b.id);
                  return to === undefined ? b : Object.freeze({ ...b, position: to });
                }),
              ),
            }),
      boomerangs: Object.freeze(boomerangs),
      extraBoomerangs: Object.freeze(extraBoomerangs),
      ...(lockCount === 0 ? {} : { portalLocks: Object.freeze(locks) }),
    }),
    events,
  };
}
