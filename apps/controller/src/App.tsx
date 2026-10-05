import { EndedScreen } from './screens/EndedScreen';
import { JoinScreen } from './screens/JoinScreen';
import { PlayScreen } from './screens/PlayScreen';
import { useControllerState, type SessionPort } from './session';

export interface AppProps {
  readonly session: SessionPort;
  /** The room code from the QR link, if any. */
  readonly initialRoom: string | undefined;
}

export function App({ session, initialRoom }: AppProps) {
  const state = useControllerState(session);

  switch (state.phase) {
    case 'IDLE':
    case 'CONNECTING':
    case 'JOINING':
      return (
        <JoinScreen
          initialRoom={state.joinCode ?? initialRoom}
          busy={state.phase !== 'IDLE'}
          failure={state.failure}
          onJoin={(joinCode, displayName) => session.join(joinCode, displayName)}
        />
      );
    case 'READY':
    case 'RECONNECTING':
      return <PlayScreen state={state} session={session} />;
    case 'ENDED':
      return <EndedScreen failure={state.failure} onRestart={() => session.leave()} />;
  }
}
