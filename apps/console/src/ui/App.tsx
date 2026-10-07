import type { GameId } from '../config';
import type { ConsoleRuntime } from '../consoleRuntime';
import type { ArenaRenderer, ArenaRendererLoader } from '../render/renderer';
import type { FrameLoop } from '../runtime/frameLoop';
import { ConsoleApp } from '../shell/ConsoleApp';
import { useShellModel } from '../shell/adapter/useShellModel';
import { ShellRoot } from '../shell/ShellRoot';
import { ArenaScreen } from './ArenaScreen';
import { useHostState } from './useStore';

export interface AppProps {
  readonly runtime: ConsoleRuntime;
  /** The game PLAY opens a room for. */
  readonly gameId: GameId;
  readonly controllerBaseUrl: string;
  readonly warnings: readonly string[];
  readonly loadRenderer: ArenaRendererLoader;
  readonly createLoop?: () => FrameLoop;
  readonly now?: () => number;
  readonly debugInitiallyOpen?: boolean;
  readonly onRenderer?: (renderer: ArenaRenderer | undefined) => void;
}

/**
 * The Foomerang host. Two things can be on the TV: the console shell (home, games, players, settings)
 * and, while a match is being played, the arena. The shell sits on the session through an adapter;
 * the arena is unchanged.
 */
export function App(props: AppProps) {
  const { runtime } = props;
  const state = useHostState(runtime.session);

  if (state.roomState === 'PLAYING') {
    return (
      <ArenaScreen
        runtime={runtime}
        loadRenderer={props.loadRenderer}
        {...(props.createLoop ? { createLoop: props.createLoop } : {})}
        {...(props.now ? { now: props.now } : {})}
        {...(props.debugInitiallyOpen ? { debugInitiallyOpen: true } : {})}
        {...(props.onRenderer ? { onRenderer: props.onRenderer } : {})}
      />
    );
  }
  return <Shell {...props} />;
}

function Shell({ runtime, gameId, controllerBaseUrl, warnings }: AppProps) {
  const { model, actions } = useShellModel({ runtime, gameId, controllerBaseUrl, warnings });
  return (
    <ShellRoot>
      <ConsoleApp model={model} actions={actions} />
    </ShellRoot>
  );
}
