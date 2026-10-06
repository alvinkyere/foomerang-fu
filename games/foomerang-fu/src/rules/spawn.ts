import type { Vec2 } from '@foomerang/game-core';
import type { FuArena } from './arena';

/** Slots sit on an ellipse around the middle, evenly spread and far apart; slot 0 at the top, then clockwise. */
export function spawnPosition(slot: number, arena: FuArena): Vec2 {
  const given = arena.spawns?.[slot];
  if (given !== undefined) return given;
  const angle = (slot * Math.PI) / 3 - Math.PI / 2;
  return Object.freeze({
    x: arena.width / 2 + arena.width * 0.325 * Math.cos(angle),
    y: arena.height / 2 + arena.height * (260 / 900) * Math.sin(angle),
  });
}
