import type { ConsoleRuntime } from '../consoleRuntime';
import type { ArenaRenderer, ArenaRendererLoader } from '../render/renderer';
import type { FrameLoop } from '../runtime/frameLoop';
import { ArenaScreen } from './ArenaScreen';
import { failureCopy } from './copy';
import { Lobby } from './Lobby';
import { useHostState } from './useStore';

/** One primitive test game is enough for this milestone; there is deliberately no catalogue. */
export const PRIMITIVE_GAME_ID = 'primitive-arena';

export interface AppProps {
  readonly runtime: ConsoleRuntime;
  readonly controllerBaseUrl: string;
  /** Shown in connection errors so a wrong address is obvious. */
  readonly serverUrl: string;
  readonly warnings: readonly string[];
  readonly loadRenderer: ArenaRendererLoader;
  readonly createLoop?: () => FrameLoop;
  readonly now?: () => number;
  readonly debugInitiallyOpen?: boolean;
  readonly onRenderer?: (renderer: ArenaRenderer | undefined) => void;
}

export function App(props: AppProps) {
  const { runtime } = props;
  const state = useHostState(runtime.session);

  if (state.phase === 'IDLE') {
    return (
      <main className="screen home">
        <h1>Foomerang</h1>
        <p className="muted">Primitive arena</p>
        {state.failure !== undefined && (
          <p className="notice" role="alert">
            {failureCopy(state.failure, props.serverUrl)}
          </p>
        )}
        <button
          type="button"
          className="primary"
          onClick={() => runtime.session.createRoom(PRIMITIVE_GAME_ID)}
        >
          Create room
        </button>
      </main>
    );
  }

  if (state.phase === 'CONNECTING' || state.phase === 'CREATING') {
    return (
      <main className="screen home">
        <h1>Foomerang</h1>
        <p role="status">Creating a room…</p>
      </main>
    );
  }

  if (state.phase === 'ENDED') {
    return (
      <main className="screen home">
        <h1>Foomerang</h1>
        <p className="notice" role="alert">
          {state.failure === undefined
            ? 'This room has ended.'
            : failureCopy(state.failure, props.serverUrl)}
        </p>
        <button type="button" className="primary" onClick={() => runtime.session.leave()}>
          Start over
        </button>
      </main>
    );
  }

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

  return (
    <>
      {state.phase === 'RECONNECTING' && (
        <p className="banner" role="status">
          Reconnecting to the game server…
        </p>
      )}
      <Lobby
        runtime={runtime}
        controllerBaseUrl={props.controllerBaseUrl}
        warnings={props.warnings}
      />
    </>
  );
}
