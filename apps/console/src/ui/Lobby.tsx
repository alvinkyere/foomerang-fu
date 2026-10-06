import { useState, useSyncExternalStore } from 'react';
import type { Difficulty } from '@foomerang/foomerang-fu';
import type { ConsoleRuntime } from '../consoleRuntime';
import { buildJoinUrl } from '../config';
import { CPU_DIFFICULTIES as DIFFICULTIES, MAX_PARTICIPANTS } from '../runtime/cpuRoster';
import { GAME_MODES, type GameModeId } from '../runtime/gameMode';
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

const DIFFICULTY_LABEL: Readonly<Record<Difficulty, string>> = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
};

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
  const cpus = useSyncExternalStore(
    (listener) => runtime.director.cpus.subscribe(listener),
    () => runtime.director.cpus.entries,
  );
  const [newDifficulty, setNewDifficulty] = useState<Difficulty>('MEDIUM');
  const isFu = state.gameId === 'foomerang-fu';
  const participants = seated.length + cpus.length;
  const modeId = useSyncExternalStore(
    (listener) => runtime.director.mode.subscribe(listener),
    () => runtime.director.mode.id,
  );
  const block = isFu ? runtime.director.startBlock() : undefined;
  const tooFew = block === 'TOO_FEW';
  const tooMany = block === 'TOO_MANY';

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

      {isFu && (
        <fieldset className="modes">
          <legend>Game mode</legend>
          {GAME_MODES.map((mode) => (
            <label key={mode.id} className={mode.available ? 'mode' : 'mode unavailable'}>
              {/* A real, disabled radio: it cannot be focused, chosen or submitted, whatever its styling */}
              <input
                type="radio"
                name="game-mode"
                value={mode.id}
                checked={modeId === mode.id}
                disabled={!mode.available}
                onChange={() => runtime.director.mode.select(mode.id as GameModeId)}
              />{' '}
              <span className="mode-title">{mode.title.toUpperCase()}</span>{' '}
              <span className="mode-status muted">
                {mode.available ? 'Available' : 'COMING SOON'}
              </span>
              {mode.available && <span className="muted"> — {mode.summary}</span>}
            </label>
          ))}
        </fieldset>
      )}

      <section aria-label="Players">
        <h2>
          Players <span className="muted">({isFu ? participants : seated.length})</span>
        </h2>
        {state.roster.length === 0 && cpus.length === 0 ? (
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
            {cpus.map((cpu) => {
              const slot = runtime.director.slots.slotOf(cpu.id);
              const style = slot === undefined ? undefined : SLOT_STYLES[slot];
              return (
                <li key={cpu.id} className="cpu">
                  <span className="marker" style={{ color: style?.color }} aria-hidden="true">
                    {style?.marker ?? '○'}
                  </span>
                  <span className="player-number">{style?.number ?? ''}</span>
                  <span className="player-name">{cpu.name}</span>
                  <span className="status">CPU</span>
                  <select
                    aria-label={`Difficulty of ${cpu.name}`}
                    value={cpu.difficulty}
                    onChange={(e) =>
                      runtime.director.cpus.setDifficulty(cpu.id, e.target.value as Difficulty)
                    }
                  >
                    {DIFFICULTIES.map((d) => (
                      <option key={d} value={d}>
                        {DIFFICULTY_LABEL[d]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={`Remove ${cpu.name}`}
                    onClick={() => runtime.director.cpus.remove(cpu.id)}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {isFu && (
          <div className="cpu-controls">
            <label>
              New CPU difficulty{' '}
              <select
                value={newDifficulty}
                onChange={(e) => setNewDifficulty(e.target.value as Difficulty)}
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {DIFFICULTY_LABEL[d]}
                  </option>
                ))}
              </select>
            </label>{' '}
            <button
              type="button"
              onClick={() => runtime.director.cpus.add(newDifficulty, seated.length)}
              disabled={participants >= MAX_PARTICIPANTS}
            >
              Add CPU
            </button>
          </div>
        )}
        {tooFew && (
          <p className="muted">At least two players are needed: add a CPU or wait for a friend.</p>
        )}
        {tooMany && (
          <p className="warning" role="alert">
            A match holds at most {MAX_PARTICIPANTS} players: remove a CPU.
          </p>
        )}
      </section>

      {state.matchInterrupted && (
        <p className="notice" role="status">
          The match was interrupted: this console page was reloaded, and the game it was running is
          gone. Kills and powerups were not kept. Start a new match when you are ready.
        </p>
      )}

      {state.notice !== undefined && (
        <p className="notice" role="status">
          {noticeCopy(state.notice)}
        </p>
      )}

      <button
        type="button"
        className="primary"
        onClick={() => runtime.startMatch()}
        disabled={state.phase !== 'ACTIVE' || block !== undefined}
      >
        Start
      </button>
    </main>
  );
}
