import type { Vec2, WorldState } from '@foomerang/game-core';
import type { RosterEntry } from '@foomerang/protocol';
import { SLOT_STYLES, type SlotAllocator, type SlotStyle } from '../runtime/slots';

export type CircleStatus = RosterEntry['connection'] | 'RELEASED';

export interface CircleView {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly label: string;
  readonly number: number;
  readonly color: string;
  readonly shape: SlotStyle['shape'];
  readonly status: CircleStatus;
  /** Shown faded: away (reconnecting / disconnected / left) or dead. */
  readonly dimmed: boolean;
  /** A rules fact (the player was killed). How death LOOKS is the renderer's business. */
  readonly dead: boolean;
  /** Which way a throw would go; absent for games with no aiming. */
  readonly facing?: Vec2;
  /** Their boomerang is in hand, ready to throw. */
  readonly armed: boolean;
}

export interface BoomerangView {
  readonly ownerId: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: string;
  readonly state: 'THROWN' | 'RETURNING';
}

/** A one-shot thing that just happened, for the renderer to make a brief effect of. */
export interface ViewEvent {
  readonly type: 'THROWN' | 'HIT' | 'CAUGHT' | 'ROUND_START';
  readonly x: number;
  readonly y: number;
  readonly color: string;
}

export interface ArenaView {
  readonly width: number;
  readonly height: number;
  readonly circles: readonly CircleView[];
  readonly boomerangs: readonly BoomerangView[];
  readonly events: readonly ViewEvent[];
  /** Text to show big while a round is over (winner or draw). */
  readonly banner: string | undefined;
  readonly round: number | undefined;
}

const FALLBACK: SlotStyle = { color: '#9AA0A6', number: 0, shape: 'circle', marker: '○' };

export const styleOf = (id: string, slots: SlotAllocator): SlotStyle => {
  const slot = slots.slotOf(id);
  return (slot === undefined ? undefined : SLOT_STYLES[slot]) ?? FALLBACK;
};

/** Who a circle is, shared by every game's view: name, slot style, and whether they are away. */
export function identityOf(
  id: string,
  roster: readonly RosterEntry[],
  slots: SlotAllocator,
): Pick<CircleView, 'label' | 'number' | 'color' | 'shape' | 'status' | 'dimmed'> {
  const entry = roster.find((r) => r.playerId === id);
  const style = styleOf(id, slots);
  const status: CircleStatus =
    entry === undefined
      ? 'DISCONNECTED'
      : entry.seat === 'RELEASED'
        ? 'RELEASED'
        : entry.connection;
  return {
    label: entry?.displayName ?? 'Player',
    number: style.number,
    color: style.color,
    shape: style.shape,
    status,
    dimmed: status !== 'CONNECTED',
  };
}

/**
 * Pure: authoritative WorldState + roster → what to draw (the primitive arena). The renderer
 * (Phaser) receives only this and draws it; it never simulates and never invents a position.
 */
export function buildArenaView(
  world: WorldState,
  roster: readonly RosterEntry[],
  slots: SlotAllocator,
): ArenaView {
  return {
    width: world.arena.width,
    height: world.arena.height,
    circles: world.bodies.map((body): CircleView => ({
      id: body.id,
      x: body.position.x,
      y: body.position.y,
      radius: body.radius,
      ...identityOf(body.id, roster, slots),
      dead: false,
      armed: false,
    })),
    boomerangs: [],
    events: [],
    banner: undefined,
    round: undefined,
  };
}
