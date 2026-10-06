import type { FuEvent, FuState } from '@foomerang/foomerang-fu';
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
    };
  });

  const boomerangs = state.boomerangs.flatMap((b): BoomerangView[] =>
    b.state === 'HELD'
      ? []
      : [
          {
            ownerId: b.ownerId,
            x: b.position.x,
            y: b.position.y,
            radius: state.config.boomerangRadius,
            color: styleOf(b.ownerId, slots).color,
            state: b.state,
          },
        ],
  );

  const viewEvents = events.flatMap((event): ViewEvent[] => {
    switch (event.type) {
      case 'THROWN':
        return [{ type: 'THROWN', ...event.position, color: styleOf(event.playerId, slots).color }];
      case 'HIT':
        return [{ type: 'HIT', ...event.position, color: styleOf(event.victimId, slots).color }];
      case 'CAUGHT':
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
    circles,
    boomerangs,
    events: viewEvents,
    banner,
    round: state.round,
  };
}
