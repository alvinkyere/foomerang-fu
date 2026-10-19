import {
  isFatigued,
  roundLabel,
  systemsView,
  type FuArena,
  type FuEvent,
  type FuState,
} from '@foomerang/foomerang-fu';
import type { RosterEntry } from '@foomerang/protocol';
import { PLAYABLE_ARENAS, choiceOf } from '../runtime/arenas';
import { isCpuId } from '../runtime/cpuRoster';
import type { ArenaChoice } from '../runtime/powerupMode';
import { SLOT_STYLES, type SlotAllocator } from '../runtime/slots';
import {
  identityOf,
  styleOf,
  type ArenaView,
  type BoomerangView,
  type CircleView,
  type HudView,
  type ScoreEntryView,
  type ScoreEventView,
  type ViewEvent,
} from './viewModel';

/**
 * Pure: Foomerang Fu's authoritative state (and what just happened) → what to draw. Death, facing
 * and the boomerangs are FACTS taken from the rules; every flash, trail and fade is the renderer's
 * own presentation, built from this and never fed back.
 */
/** The unit direction from `p` straight back into the safe zone (towards its nearest point). */
function wayIn(
  p: { x: number; y: number },
  zone: { x: number; y: number; width: number; height: number } | undefined,
) {
  if (zone === undefined) return { x: 0, y: 0 };
  const tx = Math.min(Math.max(p.x, zone.x), zone.x + zone.width) - p.x;
  const ty = Math.min(Math.max(p.y, zone.y), zone.y + zone.height) - p.y;
  const d = Math.hypot(tx, ty);
  return d < 1e-9 ? { x: 0, y: 0 } : { x: tx / d, y: ty / d };
}

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
      ...(!dead && player !== undefined && player.outsideFor > 0
        ? {
            outside: {
              seconds: player.outsideFor,
              limit: state.config.outsideLimitSeconds,
              toward: wayIn(body.position, state.config.arena.safeZone),
            },
          }
        : {}),
      ...(!dead && player?.charge.phase === 'CHARGING'
        ? { aim: aimOf(player.charge.seconds) }
        : {}),
    };
  });

  // a charging throw: how charged so far, and how far it would fly if let go now (the rules' own interpolation)
  function aimOf(seconds: number): { power: number; reach: number } {
    const c = state.config;
    const power = Math.min(1, seconds / c.fullChargeSeconds);
    return { power, reach: c.throwRange + (c.chargedThrowRange - c.throwRange) * power };
  }

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
              power: b.power,
              state: b.state,
              spent: state.phase !== 'PLAYING',
            },
          ];
    },
  );

  const viewEvents = events.flatMap((event): ViewEvent[] => {
    switch (event.type) {
      case 'THROWN':
        return [
          {
            type: 'THROWN',
            ...event.position,
            color: styleOf(event.playerId, slots).color,
            actor: event.playerId,
          },
        ];
      case 'SLASHED':
        return [
          {
            type: 'SLASHED',
            ...event.position,
            color: styleOf(event.playerId, slots).color,
            actor: event.playerId,
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
            actor: event.playerId,
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
      case 'SCORE': // the meters are drawn from the state; the change itself is the HUD's feedback
      case 'MATCH_WON':
      case 'TIEBREAK_START':
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
      case 'RICOCHET':
        return [
          {
            type: 'RICOCHET',
            ...event.position,
            color: styleOf(event.ownerId, slots).color,
            ownerId: event.ownerId,
          },
        ];
      case 'PROP_BROKEN':
        return [
          {
            type: 'PROP_BROKEN',
            ...event.position,
            color: styleOf(event.byId, slots).color,
            propId: event.id,
            from: positionOf(event.byId),
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
        return [
          {
            type: 'HIT',
            ...event.position,
            color: styleOf(event.victimId, slots).color,
            actor: event.victimId,
          },
        ];
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
        ? 'Round over'
        : `${identityOf(winnerId, roster, slots).label} is the last one standing`;
  }

  const entryOf = (id: string): ScoreEntryView => {
    const identity = identityOf(id, roster, slots);
    const style = SLOT_STYLES.find((st) => st.number === identity.number);
    return {
      id,
      label: identity.label,
      marker: style?.marker ?? '○',
      number: identity.number,
      color: identity.color,
      kills: state.scores[id] ?? 0,
      cpu: isCpuId(id),
    };
  };
  const label = roundLabel(state);
  const target = state.config.targetKills;
  const scoreEvents = events.flatMap((e, i): ScoreEventView[] =>
    e.type === 'SCORE'
      ? [
          {
            key: `${state.elapsed.toFixed(4)}:${i}`,
            playerId: e.playerId,
            label: identityOf(e.playerId, roster, slots).label,
            delta: e.delta,
            reason: e.reason,
            kills: e.kills,
            victimLabel: identityOf(e.victimId, roster, slots).label,
          },
        ]
      : [],
  );
  const hud: HudView = {
    target,
    roundLabel:
      label.kind === 'TIEBREAK'
        ? 'TIEBREAK'
        : label.kind === 'OVERTIME'
          ? `OVERTIME ROUND ${label.round}`
          : label.of === undefined
            ? `ROUND ${label.round}`
            : `ROUND ${label.round} / ${label.of}`,
    phase: state.phase,
    entries: state.players.map((p) => entryOf(p.id)),
    champion: state.matchOver === undefined ? undefined : entryOf(state.matchOver.winnerId),
    tiebreak:
      state.phase === 'ROUND_OVER' && target !== undefined
        ? state.players.filter((p) => (state.scores[p.id] ?? 0) >= target).map((p) => p.id)
        : [],
    scoreEvents,
    waiting: [],
  };

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
    systems: systemsView(state.config.arena, state.roundTime, state.gatesShut),
    broken: state.broken,
    events: viewEvents,
    banner,
    round: state.round,
    hud,
    ...namedArena(state.config.arena),
  };
}

/** The production arena's name for the renderer (a reconstructed map); test arenas stay unnamed. */
function namedArena(arena: FuArena): { readonly arenaId?: ArenaChoice } {
  const choice = choiceOf(arena);
  return choice !== undefined && PLAYABLE_ARENAS[choice].named ? { arenaId: choice } : {};
}
