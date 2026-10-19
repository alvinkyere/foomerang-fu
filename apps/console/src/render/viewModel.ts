import type { Vec2, WorldState } from '@foomerang/game-core';
import type { PowerKind } from '@foomerang/foomerang-fu';
import type { RosterEntry } from '@foomerang/protocol';
import type { ArenaChoice } from '../runtime/powerupMode';
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
  /**
   * Present only while a living player is outside the arena's border (a rules fact): how long they have been out, the limit
   * at which they explode, and the unit direction straight back inside. The warning (blink, arrow, rumble) is presentation.
   */
  readonly outside?: { readonly seconds: number; readonly limit: number; readonly toward: Vec2 };
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
  /** Who the event is about (the thrower, the swinger, the victim of a HIT...): lets a presentation animate that player. */
  readonly actor?: string;
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
/** An axis-aligned rectangle (x, y = top-left corner). */
export interface RectView {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A solid as the rules define it: a rectangle, a disc (x, y = centre) or a turned box (x, y = centre; angle in radians). */
export type WallView =
  | RectView
  | { readonly shape: 'disc'; readonly x: number; readonly y: number; readonly radius: number }
  | {
      readonly shape: 'box';
      readonly x: number;
      readonly y: number;
      readonly halfWidth: number;
      readonly halfHeight: number;
      readonly angle: number;
    };

/** The arena's interactive systems, exactly as the rules have them right now (Slice 6). */
export interface SystemsViewModel {
  readonly gates: readonly {
    readonly rect: RectView;
    readonly status: 'OPEN' | 'CLOSING' | 'CLOSED';
    /** Scheduled to be closed but something is in the way, so it is still open. */
    readonly held: boolean;
    readonly secondsToChange: number;
  }[];
  readonly platforms: readonly {
    readonly rect: RectView;
    readonly direction: Vec2;
    readonly moving: boolean;
  }[];
  readonly hazards: readonly {
    readonly rect: RectView;
    readonly phase: 'SAFE' | 'WARNING' | 'ACTIVE';
    readonly secondsToChange: number;
  }[];
}

export const NO_SYSTEMS: SystemsViewModel = { gates: [], platforms: [], hazards: [] };

/** One player's row in the kill race: who they are (name, colour, marker, number: never colour alone) and their holes. */
export interface ScoreEntryView {
  readonly id: string;
  readonly label: string;
  readonly marker: string;
  readonly number: number;
  readonly color: string;
  /** Holes filled (kills). */
  readonly kills: number;
  readonly cpu: boolean;
}

/** A kill meter just changed (a rules fact, from a SCORE event): for the brief on-screen feedback. */
export interface ScoreEventView {
  /** Unique, so a repeat is not mistaken for the same event. */
  readonly key: string;
  readonly playerId: string;
  readonly label: string;
  /** +1 a hole filled, −1 a hole emptied, 0 a penalty at an empty meter. */
  readonly delta: number;
  readonly reason: 'KILL' | 'SELF_KILL' | 'ENVIRONMENT';
  /** Their kills after the change. */
  readonly kills: number;
  /** Whose death it was (their name), for "Alvin → Bea". */
  readonly victimLabel: string;
}

/** The race, as the score strip, the standings and the champion screen draw it. Presentation only: every number is the rules'. */
export interface HudView {
  /** The kills that win the match (14), or undefined in a game without a race. */
  readonly target: number | undefined;
  /** "ROUND 3 / 9", "OVERTIME ROUND 1", "TIEBREAK". */
  readonly roundLabel: string;
  readonly phase: 'PLAYING' | 'ROUND_OVER' | 'MATCH_OVER';
  /** In player order (stable: the same row for the same player all match). */
  readonly entries: readonly ScoreEntryView[];
  /** Set once somebody has won. */
  readonly champion: ScoreEntryView | undefined;
  /** At the end of a round: who filled their meters together and will play a tiebreak. */
  readonly tiebreak: readonly string[];
  /** The meters that changed since the last view (delivered once, like the arena events). */
  readonly scoreEvents: readonly ScoreEventView[];
  /** People who joined while this match was running: they play the next one. */
  readonly waiting: readonly string[];
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
  /** Gates, platforms and hazards (empty in arenas without them). */
  readonly systems: SystemsViewModel;
  readonly events: readonly ViewEvent[];
  /** Text to show big while a round is over. */
  readonly banner: string | undefined;
  readonly round: number | undefined;
  /** The kill race (Free For All); absent for the primitive arena. */
  readonly hud?: HudView;
  /** Which production arena this is (a reconstructed map), or absent for the primitive test arenas. */
  readonly arenaId?: ArenaChoice;
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
    systems: NO_SYSTEMS,
    events: [],
    banner: undefined,
    round: undefined,
  };
}
