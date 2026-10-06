import type { ConsoleRuntime } from '../consoleRuntime';
import { buildJoinUrl } from '../config';
import { SLOT_STYLES } from '../runtime/slots';
import { noticeCopy } from './copy';
import { titleOf } from './games';
import { QrCode } from './QrCode';
import { useHostState } from './useStore';

const STATUS_TEXT = {
  CONNECTED: 'Connected',
  RECONNECTING: 'Reconnecting…',
  DISCONNECTED: 'Disconnected',
} as const;

export function Lobby({
  runtime,
  controllerBaseUrl,
  warnings,
}: {
  readonly runtime: ConsoleRuntime;
  readonly controllerBaseUrl: string;
  readonly warnings: readonly string[];
}) {
  const state = useHostState(runtime.session);
  const code = state.joinCode ?? '';
  const joinUrl = code === '' ? undefined : buildJoinUrl(controllerBaseUrl, code);
  const seated = state.roster.filter((entry) => entry.seat === 'HELD');

  return (
    <main className="screen lobby">
      <header>
        <h1>{titleOf(state.gameId).title}</h1>
        <p className="muted">{titleOf(state.gameId).subtitle}</p>
      </header>

      {warnings.map((warning) => (
        <p key={warning} className="warning" role="alert">
          {warning}
        </p>
      ))}

      <section className="join" aria-label="How to join">
        {joinUrl !== undefined && (
          <QrCode value={joinUrl} label={`QR code to join room ${code} from a phone`} />
        )}
        <div className="join-details">
          <p className="muted">Scan the QR code, or open the controller and enter</p>
          <p className="room-code" aria-label={`Room code ${code.split('').join(' ')}`}>
            {code}
          </p>
          {joinUrl !== undefined && <p className="join-url">{joinUrl}</p>}
        </div>
      </section>

      <section aria-label="Players">
        <h2>
          Players <span className="muted">({seated.length})</span>
        </h2>
        {state.roster.length === 0 ? (
          <p className="muted">Waiting for players to join…</p>
        ) : (
          <ul className="roster">
            {state.roster.map((entry) => {
              const slot = runtime.director.slots.slotOf(entry.playerId);
              const style = slot === undefined ? undefined : SLOT_STYLES[slot];
              const away = entry.connection !== 'CONNECTED';
              return (
                <li key={entry.playerId} className={away ? 'away' : undefined}>
                  <span className="marker" style={{ color: style?.color }} aria-hidden="true">
                    {style?.marker ?? '○'}
                  </span>
                  <span className="player-number">{style?.number ?? ''}</span>
                  <span className="player-name">{entry.displayName}</span>
                  <span className="status">
                    {entry.seat === 'RELEASED' ? 'Left' : STATUS_TEXT[entry.connection]}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {state.notice !== undefined && (
        <p className="notice" role="status">
          {noticeCopy(state.notice)}
        </p>
      )}

      <button
        type="button"
        className="primary"
        onClick={() => runtime.session.startMatch()}
        disabled={state.phase !== 'ACTIVE'}
      >
        Start
      </button>
    </main>
  );
}
