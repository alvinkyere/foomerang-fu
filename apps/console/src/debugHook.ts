import type { ConsoleRuntime } from './consoleRuntime';
import type { ArenaRenderer } from './render/renderer';
import type { WallView } from './render/viewModel';

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
  /** The map of the current (or last) Foomerang Fu match: it changes every match. */
  readonly arena: string | null;
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
  /** The props drawn broken and the debris lying about (the 3D plaza only). */
  readonly drawnProps: { readonly broken: readonly string[]; readonly pieces: number } | undefined;
  /** Which character each player is drawn as (the 3D plaza only). */
  readonly drawnCharacters: Readonly<Record<string, string>> | undefined;
  /** The pickups the renderer has on screen (undefined until Phaser is up). */
  readonly drawnPickups: readonly { id: string; x: number; y: number }[] | undefined;
  /** The walls the renderer has on screen (undefined until Phaser is up). */
  readonly drawnWalls: readonly WallView[] | undefined;
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
      for (const id of [
        ...state.roster.map((r) => r.playerId),
        ...runtime.director.cpus.entries.map((c) => c.id),
      ]) {
        const slot = runtime.director.slots.slotOf(id);
        if (slot !== undefined) slots[id] = slot;
      }
      const snapshot: DebugSnapshot = {
        phase: state.phase,
        arena: runtime.arena() ?? null,
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
        drawnProps: getRenderer()?.drawnProps?.(),
        drawnCharacters: getRenderer()?.drawnCharacters?.(),
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
