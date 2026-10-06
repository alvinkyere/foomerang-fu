import type { WorldState } from '@foomerang/game-core';
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
  readonly dimmed: boolean;
}

export interface ArenaView {
  readonly width: number;
  readonly height: number;
  readonly circles: readonly CircleView[];
}

const FALLBACK: SlotStyle = { color: '#9AA0A6', number: 0, shape: 'circle', marker: '○' };

/**
 * Pure: authoritative WorldState + roster → what to draw. The renderer (Phaser) receives only this
 * and draws it; it never simulates and never invents a position.
 */
export function buildArenaView(
  world: WorldState,
  roster: readonly RosterEntry[],
  slots: SlotAllocator,
): ArenaView {
  const byId = new Map(roster.map((entry) => [entry.playerId, entry]));
  return {
    width: world.arena.width,
    height: world.arena.height,
    circles: world.bodies.map((body): CircleView => {
      const entry = byId.get(body.id);
      const slot = slots.slotOf(body.id);
      const style = (slot === undefined ? undefined : SLOT_STYLES[slot]) ?? FALLBACK;
      const status: CircleStatus =
        entry === undefined
          ? 'DISCONNECTED'
          : entry.seat === 'RELEASED'
            ? 'RELEASED'
            : entry.connection;
      return {
        id: body.id,
        x: body.position.x,
        y: body.position.y,
        radius: body.radius,
        label: entry?.displayName ?? 'Player',
        number: style.number,
        color: style.color,
        shape: style.shape,
        status,
        dimmed: status !== 'CONNECTED',
      };
    }),
  };
}
