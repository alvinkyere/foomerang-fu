import { createWorld, type WorldState } from '@foomerang/game-core';

/** The primitive arena: a fixed 1600 × 900 world (units, not pixels — rendering scales it). */
export const ARENA = { width: 1600, height: 900 } as const;
export const PLAYER_RADIUS = 36;
/** World units per second at full deflection: edge to edge in about 4 seconds. */
export const MAX_SPEED = 420;

/** Slots sit on an ellipse around the middle, evenly spread and far apart. */
export function spawnPosition(slot: number): { x: number; y: number } {
  const angle = (slot * Math.PI) / 3 - Math.PI / 2; // slot 0 at the top, then clockwise
  return {
    x: ARENA.width / 2 + 520 * Math.cos(angle),
    y: ARENA.height / 2 + 260 * Math.sin(angle),
  };
}

export function createArenaWorld(
  players: readonly { readonly playerId: string; readonly slot: number }[],
): WorldState {
  return createWorld({
    arena: ARENA,
    movement: { maxSpeed: MAX_SPEED },
    bodies: players.map(({ playerId, slot }) => ({
      id: playerId,
      position: spawnPosition(slot),
      radius: PLAYER_RADIUS,
    })),
  });
}
