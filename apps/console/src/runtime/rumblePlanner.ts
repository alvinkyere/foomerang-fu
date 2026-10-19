import { isCpuId } from './cpuRoster';

/** A vibration for one player's phone. */
export interface PlannedRumble {
  readonly playerId: string;
  readonly intensity: number;
  readonly durationMs: number;
}

/** What the planner reads of each player (rules facts). */
export interface RumbleSubject {
  readonly id: string;
  readonly alive: boolean;
  /** Seconds outside the arena's border (0 inside). */
  readonly outsideFor: number;
}

const EVERY_MS = 250;
const PULSE_MS = 220;
const BURST = { intensity: 1, durationMs: 600 } as const;

/**
 * When each phone vibrates (the plaza's border): while a player is outside, a pulse every quarter second whose strength
 * rises with the time out there (from 0.2 at once to 1 at the limit); when they explode, the strongest, longest one, once.
 * Stepping back in stops it at once. CPUs have no phone. Pure apart from its own memory; time is injected.
 */
export class RumblePlanner {
  readonly #lastSent = new Map<string, number>();
  readonly #wasOutside = new Map<string, boolean>();

  plan(players: readonly RumbleSubject[], limitSeconds: number, nowMs: number): PlannedRumble[] {
    const out: PlannedRumble[] = [];
    for (const p of players) {
      if (isCpuId(p.id)) continue;
      const wasOutside = this.#wasOutside.get(p.id) ?? false;
      if (!p.alive) {
        if (wasOutside) out.push({ playerId: p.id, ...BURST });
        this.#wasOutside.set(p.id, false);
        this.#lastSent.delete(p.id);
        continue;
      }
      if (p.outsideFor <= 0) {
        this.#wasOutside.set(p.id, false);
        this.#lastSent.delete(p.id);
        continue;
      }
      this.#wasOutside.set(p.id, true);
      const last = this.#lastSent.get(p.id);
      if (last !== undefined && nowMs - last < EVERY_MS) continue;
      this.#lastSent.set(p.id, nowMs);
      const k = Math.min(1, p.outsideFor / limitSeconds);
      out.push({
        playerId: p.id,
        intensity: Math.round((0.2 + 0.8 * k) * 1000) / 1000,
        durationMs: PULSE_MS,
      });
    }
    return out;
  }
}
