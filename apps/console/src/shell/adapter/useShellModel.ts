import { useMemo, useSyncExternalStore } from 'react';
import type { Difficulty } from '@foomerang/foomerang-fu';
import type { ConsoleRuntime } from '../../consoleRuntime';
import { CPU_DIFFICULTIES } from '../../runtime/cpuRoster';
import { useHostState } from '../../ui/useStore';
import type { ShellActions, ShellModel } from '../model';
import { buildShellModel } from './buildModel';

export interface ShellSource {
  readonly runtime: ConsoleRuntime;
  readonly gameId: string;
  readonly controllerBaseUrl: string;
  readonly warnings: readonly string[];
}

/** The thin session adapter: subscribes to the real session and CPU roster, exposes a model and actions. */
export function useShellModel(source: ShellSource): { model: ShellModel; actions: ShellActions } {
  const { runtime } = source;
  const state = useHostState(runtime.session);
  const cpus = useSyncExternalStore(
    (listener) => runtime.director.cpus.subscribe(listener),
    () => runtime.director.cpus.entries,
  );
  const mode = useSyncExternalStore(
    (listener) => runtime.director.mode.subscribe(listener),
    () => runtime.director.mode.id,
  );

  const model = useMemo(
    () =>
      buildShellModel({
        state,
        cpus,
        slotOf: (id) => runtime.director.slots.slotOf(id),
        startBlock: runtime.director.startBlock(),
        gameId: source.gameId,
        controllerBaseUrl: source.controllerBaseUrl,
        warnings: source.warnings,
        version: '0.1',
        build: import.meta.env.DEV ? 'Development' : 'Release',
      }),
    // `mode` is read by startBlock(); the roster and CPUs are covered by state and cpus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, cpus, mode, runtime, source.gameId, source.controllerBaseUrl, source.warnings],
  );

  const actions = useMemo<ShellActions>(() => {
    const humans = (): number =>
      runtime.session.getState().roster.filter((entry) => entry.seat === 'HELD').length;
    return {
      openRoom: () => runtime.session.createRoom(source.gameId),
      closeRoom: () => runtime.session.leave(),
      start: () => runtime.startMatch(),
      addCpu: () => void runtime.director.cpus.add('MEDIUM', humans()),
      removeCpu: (id) => runtime.director.cpus.remove(id),
      stepCpu: (id, delta) => {
        const entry = runtime.director.cpus.entries.find((e) => e.id === id);
        if (entry === undefined) return;
        const at = CPU_DIFFICULTIES.indexOf(entry.difficulty);
        const next =
          CPU_DIFFICULTIES[Math.min(CPU_DIFFICULTIES.length - 1, Math.max(0, at + delta))];
        if (next !== undefined && next !== entry.difficulty) {
          runtime.director.cpus.setDifficulty(id, next as Difficulty);
        }
      },
      dismissFailure: () => runtime.session.leave(),
    };
  }, [runtime, source.gameId]);

  return { model, actions };
}
