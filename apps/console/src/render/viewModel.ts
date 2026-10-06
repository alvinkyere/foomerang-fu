import type { Vec2, WorldState } from '@foomerang/game-core';
import type { PowerKind } from '@foomerang/foomerang-fu';
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
  /** Present only while the player is mid-dash (a rules fact): the way they are going. A streak is the renderer's. */
  readonly dashing?: { readonly direction: Vec2 };
  /** Present (true) only while the player is FATIGUED (a rules fact): slower walking and weaker dashes. */
  readonly fatigued?: true;
  /** The powerups they hold now (a rules fact), in a fixed order; empty for games without them. */
  readonly powers: readonly PowerKind[];
  /** Present only during a Phase Dash: they may cross walls right now. */
  readonly phasing?: { readonly inWall: boolean };
}

/** A powerup lying in the arena. */
export interface PickupView {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

export interface BoomerangView {
  /** Unique among the boomerangs on screen: the owner's id, or `<owner>#2` for their twin. */
  readonly id: string;
  /** Armed with BLAST_BOOMERANG (a rules fact). */
  readonly blast: boolean;
  readonly ownerId: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: string;
  readonly state: 'THROWN' | 'RETURNING' | 'DEFLECTED';
  /** The round is over: this projectile is no longer live and should not be drawn as if it were. */
  readonly spent: boolean;
}

/** A one-shot thing that just happened, for the renderer to make a brief effect of. */
export interface ViewEvent {
  readonly type:
    | 'THROWN'
    | 'HIT'
    | 'CAUGHT'
    | 'SLASHED'
    | 'DEFLECTED'
    | 'DASHED'
    | 'FATIGUED'
    | 'RECOVERED'
    | 'SPAWNED'
    | 'PICKUP'
    | 'POWER_LOST'
    | 'BLASTED'
    | 'GUARD_BLOCKED'
    | 'PHASE_ENTERED'
    | 'PHASE_EXITED'
    | 'ROUND_START';
  readonly x: number;
  readonly y: number;
  readonly color: string;
  /** For DEFLECTED: where the boomerang was sent (unit vector), so the effect can point the way it went. */
  readonly knock?: Vec2;
  /** For DASHED: the way the dash goes (unit vector), so the burst can be drawn pointing along it. */
  readonly direction?: Vec2;
  /** For DASHED: a Phase Dash (may cross walls). */
  readonly phasing?: true;
  /** For PICKUP / POWER_LOST: which power (revealed only when the Book is taken). */
  readonly kind?: PowerKind;
  /** For PICKUP / POWER_LOST: who (their display name), for the on-screen announcement. */
  readonly who?: string;
  /** For POWER_LOST: why. */
  readonly reason?: 'EVICTED' | 'SHIELD_BROKEN';
  /** For BLASTED: the blast radius, exactly as the rules resolve it. */
  readonly radius?: number;
  /** For SLASHED: the swing exactly as the rules resolve it, so it can be drawn but never decided. */
  readonly swing?: {
    readonly direction: Vec2;
    readonly reach: number;
    readonly arc: number;
    /** Active window plus recovery: how long the swing is "in progress". */
    readonly seconds: number;
  };
}

/** A solid rectangle of the arena, as the rules define it. The renderer only draws it. */
export interface WallView {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ArenaView {
  readonly width: number;
  readonly height: number;
  /** Solid cover. Empty for the primitive circles arena. */
  readonly walls: readonly WallView[];
  readonly circles: readonly CircleView[];
  readonly boomerangs: readonly BoomerangView[];
  /** Powerups lying in the arena. */
  readonly pickups: readonly PickupView[];
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
    walls: [],
    circles: world.bodies.map((body): CircleView => ({
      id: body.id,
      x: body.position.x,
      y: body.position.y,
      radius: body.radius,
      ...identityOf(body.id, roster, slots),
      dead: false,
      armed: false,
      powers: [],
    })),
    boomerangs: [],
    pickups: [],
    events: [],
    banner: undefined,
    round: undefined,
  };
}
