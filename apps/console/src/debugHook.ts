import type { ConsoleRuntime } from './consoleRuntime';
import type { ArenaRenderer } from './render/renderer';

/**
 * A READ-ONLY window for automated browser tests, installed ONLY in development builds (main.tsx
 * guards the import with `import.meta.env.DEV`, so production bundles contain none of this and a
 * build check fails if the global's name ever appears there).
 *
 * It exposes one function that returns a deep COPY of observable state. No credentials (the host
 * token never leaves HostSession), no sessions, no runtime objects and no way to mutate anything.
 */
export interface DebugSnapshot {
  readonly phase: string;
  readonly joinCode: string | undefined;
  readonly roomState: string | undefined;
  readonly roster: readonly {
    playerId: string;
    displayName: string;
    connection: string;
    seat: string;
  }[];
  /** Authoritative game-core positions. */
  readonly bodies: readonly { id: string; x: number; y: number }[];
  /** Where the renderer actually has each circle (undefined until Phaser is up). */
  readonly drawn: readonly { id: string; x: number; y: number }[] | undefined;
  /** Where the renderer has each flying boomerang (undefined until Phaser is up). */
  readonly drawnBoomerangs: readonly { id: string; x: number; y: number }[] | undefined;
  /** What the renderer has drawn of the arena systems (undefined until Phaser is up). */
  readonly drawnSystems: unknown;
  /** The pickups the renderer has on screen (undefined until Phaser is up). */
  readonly drawnPickups: readonly { id: string; x: number; y: number }[] | undefined;
  /** The walls the renderer has on screen (undefined until Phaser is up). */
  readonly drawnWalls:
    readonly { x: number; y: number; width: number; height: number }[] | undefined;
  /** The running game's own state (Foomerang Fu: round, phase, who is alive, boomerangs). */
  readonly game: unknown;
  /** Counters from the console's own session (no credentials). */
  readonly diagnostics: ReturnType<ConsoleRuntime['session']['diagnostics']>;
  readonly slots: Readonly<Record<string, number>>;
  readonly metrics: ReturnType<ConsoleRuntime['director']['runtime']['metrics']>;
}

declare global {
  interface Window {
    __FOOMERANG__?: { snapshot(): DebugSnapshot };
  }
}

export function installDebugHook(
  runtime: ConsoleRuntime,
  getRenderer: () => ArenaRenderer | undefined,
): void {
  window.__FOOMERANG__ = {
    snapshot(): DebugSnapshot {
      const state = runtime.session.getState();
      const slots: Record<string, number> = {};
      for (const entry of state.roster) {
        const slot = runtime.director.slots.slotOf(entry.playerId);
        if (slot !== undefined) slots[entry.playerId] = slot;
      }
      const snapshot: DebugSnapshot = {
        phase: state.phase,
        joinCode: state.joinCode,
        roomState: state.roomState,
        roster: state.roster.map((r) => ({ ...r })),
        bodies: (runtime.director.runtime.world?.bodies ?? []).map((b) => ({
          id: b.id,
          x: b.position.x,
          y: b.position.y,
        })),
        drawn: getRenderer()
          ?.drawn()
          .map((d) => ({ ...d })),
        drawnBoomerangs: getRenderer()
          ?.drawnBoomerangs()
          .map((d) => ({ ...d })),
        drawnSystems: getRenderer()?.drawnSystems?.(),
        drawnPickups: getRenderer()
          ?.drawnPickups?.()
          .map((d) => ({ ...d })),
        drawnWalls: getRenderer()
          ?.drawnWalls()
          .map((w) => ({ ...w })),
        game: runtime.director.runtime.debugState(),
        diagnostics: runtime.session.diagnostics(),
        slots,
        metrics: runtime.director.runtime.metrics(),
      };
      return JSON.parse(JSON.stringify(snapshot)) as DebugSnapshot;
    },
  };
}
