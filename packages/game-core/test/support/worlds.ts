import type { MovementInput } from '../../src/input';
import { createWorld, type Body, type InputFrame, type WorldState } from '../../src/world';

export const ARENA = { width: 100, height: 60 } as const;
export const MAX_SPEED = 10; // world units per second

/** A 100 × 60 arena, maxSpeed 10 u/s, radius-1 bodies starting well inside it. */
export function makeWorld(
  bodies: readonly { id: string; x: number; y: number; radius?: number }[] = [
    { id: 'A', x: 50, y: 30 },
    { id: 'B', x: 40, y: 20 },
    { id: 'C', x: 60, y: 40 },
  ],
  movement: { maxSpeed: number; deadZone?: number } = { maxSpeed: MAX_SPEED },
): WorldState {
  return createWorld({
    arena: ARENA,
    movement,
    bodies: bodies.map((b) => ({
      id: b.id,
      position: { x: b.x, y: b.y },
      radius: b.radius ?? 1,
    })),
  });
}

export const frame = (entries: Record<string, MovementInput>): InputFrame =>
  new Map(Object.entries(entries));

export function body(state: WorldState, id: string): Body {
  const found = state.bodies.find((b) => b.id === id);
  if (!found) throw new Error(`test setup: no body ${id}`);
  return found;
}

export const at = (state: WorldState, id: string) => body(state, id).position;

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const RIGHT = { x: 1, y: 0 } as const;
export const LEFT = { x: -1, y: 0 } as const;
export const UP = { x: 0, y: -1 } as const;
export const DOWN = { x: 0, y: 1 } as const;
export const STILL = { x: 0, y: 0 } as const;
