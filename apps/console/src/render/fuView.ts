import { isFatigued, type FuEvent, type FuState } from '@foomerang/foomerang-fu';
import type { RosterEntry } from '@foomerang/protocol';
import type { SlotAllocator } from '../runtime/slots';
import {
  identityOf,
  styleOf,
  type ArenaView,
  type BoomerangView,
  type CircleView,
  type ViewEvent,
} from './viewModel';

/**
 * Pure: Foomerang Fu's authoritative state (and what just happened) → what to draw. Death, facing
 * and the boomerangs are FACTS taken from the rules; every flash, trail and fade is the renderer's
 * own presentation, built from this and never fed back.
 */
export function buildFuView(
  state: FuState,
  events: readonly FuEvent[],
  roster: readonly RosterEntry[],
  slots: SlotAllocator,
): ArenaView {
  const positionOf = (id: string): { x: number; y: number } =>
    state.world.bodies.find((b) => b.id === id)?.position ?? { x: 0, y: 0 };

  const circles = state.world.bodies.map((body): CircleView => {
    const player = state.players.find((p) => p.id === body.id);
    const boomerang = state.boomerangs.find((b) => b.ownerId === body.id);
    const identity = identityOf(body.id, roster, slots);
    const dead = player !== undefined && !player.alive;
    return {
      id: body.id,
      x: body.position.x,
      y: body.position.y,
      radius: body.radius,
      ...identity,
      dimmed: identity.dimmed || dead,
      dead,
      ...(player === undefined ? {} : { facing: player.facing }),
      armed: !dead && boomerang?.state === 'HELD',
      powers: player === undefined ? [] : player.inventory, // what they own, oldest first (the dead keep theirs)
      ...(!dead && player?.dash.phase === 'DASHING' && player.dash.phasing !== undefined
        ? { phasing: { inWall: player.dash.phasing.inside } }
        : {}),
      ...(!dead && player?.dash.phase === 'DASHING'
        ? { dashing: { direction: player.dash.direction } }
        : {}),
      ...(!dead && player !== undefined && isFatigued(player.fatigue, state.config)
        ? { fatigued: true as const }
        : {}),
    };
  });

  const seenOwner = new Map<string, number>();
  const boomerangs = [...state.boomerangs, ...state.extraBoomerangs].flatMap(
    (b): BoomerangView[] => {
      const n = (seenOwner.get(b.ownerId) ?? 0) + 1;
      seenOwner.set(b.ownerId, n);
      return b.state === 'HELD'
        ? []
        : [
            {
              id: n === 1 ? b.ownerId : `${b.ownerId}#${n}`,
              blast: b.blast,
              ownerId: b.ownerId,
              x: b.position.x,
              y: b.position.y,
              radius: state.config.boomerangRadius,
              color: styleOf(b.ownerId, slots).color,
              state: b.state,
              spent: state.phase === 'ROUND_OVER',
            },
          ];
    },
  );

  const viewEvents = events.flatMap((event): ViewEvent[] => {
    switch (event.type) {
      case 'THROWN':
        return [{ type: 'THROWN', ...event.position, color: styleOf(event.playerId, slots).color }];
      case 'SLASHED':
        return [
          {
            type: 'SLASHED',
            ...event.position,
            color: styleOf(event.playerId, slots).color,
            swing: {
              direction: event.direction,
              reach: state.config.slashReach,
              arc: state.config.slashArc,
              seconds: state.config.slashActiveSeconds + state.config.slashRecoverySeconds,
            },
          },
        ];
      case 'DASHED':
        return [
          {
            type: 'DASHED',
            ...event.position,
            color: styleOf(event.playerId, slots).color,
            direction: event.direction,
            ...(event.phasing === true ? { phasing: true as const } : {}),
          },
        ];
      case 'POWERUP_SPAWNED':
        return [{ type: 'SPAWNED', ...event.position, color: '#FFFFFF' }];
      case 'PICKED_UP':
        return [
          {
            type: 'PICKUP',
            ...event.position,
            color: styleOf(event.playerId, slots).color,
            kind: event.kind,
            who: identityOf(event.playerId, roster, slots).label,
          },
        ];
      case 'POWER_LOST':
        return [
          {
            type: 'POWER_LOST',
            ...positionOf(event.playerId),
            color: styleOf(event.playerId, slots).color,
            kind: event.kind,
            reason: event.reason,
            who: identityOf(event.playerId, roster, slots).label,
          },
        ];
      case 'MATCH_OVER':
        return [];
      case 'BLASTED':
        return [
          {
            type: 'BLASTED',
            ...event.position,
            color: styleOf(event.ownerId, slots).color,
            radius: event.radius,
          },
        ];
      case 'GUARD_BLOCKED':
        return [
          { type: 'GUARD_BLOCKED', ...event.position, color: styleOf(event.playerId, slots).color },
        ];
      case 'PHASE_ENTERED':
      case 'PHASE_EXITED':
        return [
          { type: event.type, ...event.position, color: styleOf(event.playerId, slots).color },
        ];
      case 'FATIGUED':
      case 'RECOVERED': // where the player is now: the tired ring starts / the full-mobility flash
        return [
          {
            type: event.type,
            ...positionOf(event.playerId),
            color: styleOf(event.playerId, slots).color,
          },
        ];
      case 'DEFLECTED':
        return [
          {
            type: 'DEFLECTED',
            ...event.position,
            color: styleOf(event.byId, slots).color, // the defender's colour: whose clank it was
            knock: event.direction,
          },
        ];
      case 'HIT':
        return [{ type: 'HIT', ...event.position, color: styleOf(event.victimId, slots).color }];
      case 'CAUGHT':
      case 'RECALLED': // the wall-following failsafe: shown like a catch, at the owner
        return [
          {
            type: 'CAUGHT',
            ...positionOf(event.playerId),
            color: styleOf(event.playerId, slots).color,
          },
        ];
      case 'ROUND_START':
        return [
          {
            type: 'ROUND_START',
            x: state.config.arena.width / 2,
            y: state.config.arena.height / 2,
            color: '#FFFFFF',
          },
        ];
      case 'ROUND_OVER':
        return []; // shown as the banner, which comes from the state
    }
  });

  let banner: string | undefined;
  if (state.phase === 'ROUND_OVER') {
    const winnerId = state.roundOver?.winnerId;
    banner =
      winnerId === undefined
        ? 'Draw'
        : `${identityOf(winnerId, roster, slots).label} wins the round`;
  }

  return {
    width: state.world.arena.width,
    height: state.world.arena.height,
    walls: state.config.arena.walls ?? [],
    circles,
    boomerangs,
    pickups: state.pickups.map((p) => ({
      id: p.id,
      x: p.position.x,
      y: p.position.y,
    })),
    events: viewEvents,
    banner,
    round: state.round,
  };
}
