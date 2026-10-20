import type { CSSProperties } from 'react';
import { scoreboardColours } from '../characters/videoPalette';
import { RECONSTRUCTED_MAPS, characterOf } from '../render/reconstructed/maps';
import type { HudView, ScoreEntryView } from '../render/viewModel';
import { FocusScope, useFocusItem } from '../shell/focus/FocusManager';
import './scoreboard.css';

/**
 * The scoreboard between rounds, as "ff scoreboard.jpg" shows it (owner, 2026-10-19): over the arena, one band per player in
 * seat order — their badge (P1… for a person, BOT for a CPU), their character's portrait, and a dot for every kill to win,
 * filled for each kill they have; the leader crowned. It waits: CONTINUE (any phone's SELECT, or the TV) starts the next
 * round. Presentation only: the kills and the wait are the rules' facts. A trophy heads it, between two lines, as in the
 * reference footage. At the end of the match (`winnerId`) it is the final scoreboard: the winner's band pops, everyone
 * else's fades, and CONTINUE (when `showContinue`) moves on to the results.
 */
export function Scoreboard({
  hud,
  onContinue,
  winnerId,
  showContinue = true,
}: {
  readonly hud: HudView;
  readonly onContinue: () => void;
  readonly winnerId?: string | undefined;
  readonly showContinue?: boolean;
}) {
  const { target } = hud;
  if (target === undefined) return null;
  return (
    <FocusScope id="scoreboard" initialFocus="continue" remember={false}>
      <Board
        hud={hud}
        target={target}
        onContinue={onContinue}
        winnerId={winnerId}
        showContinue={showContinue}
      />
    </FocusScope>
  );
}

const SEAT_ROSTER = RECONSTRUCTED_MAPS.market_plaza.roster;

function Board({
  hud,
  target,
  onContinue,
  winnerId,
  showContinue,
}: {
  readonly hud: HudView;
  readonly target: number;
  readonly onContinue: () => void;
  readonly winnerId: string | undefined;
  readonly showContinue: boolean;
}) {
  const proceed = useFocusItem<HTMLButtonElement>('continue');
  const best = Math.max(0, ...hud.entries.map((e) => e.kills));
  const bySeat = [...hud.entries].sort((a, b) => a.number - b.number);
  return (
    <section
      className="sb"
      role="dialog"
      aria-label="Scoreboard"
      data-final={winnerId === undefined ? undefined : true}
    >
      <p className="sb__head" aria-hidden="true">
        <svg className="sb__trophy" viewBox="0 0 32 32">
          <path d="M8 4h16v3h4c0 6-3 9-6.5 9.6A7.5 7.5 0 0 1 17.5 20v4H22v4H10v-4h4.5v-4a7.5 7.5 0 0 1-4-3.4C7 16 4 13 4 7h4Zm16 6v3.8c1.3-.8 2.1-2 2.5-3.8ZM8 10H5.5c.4 1.8 1.2 3 2.5 3.8Z" />
          <circle cx="13.5" cy="10" r="1.2" className="sb__trophy-eye" />
          <circle cx="18.5" cy="10" r="1.2" className="sb__trophy-eye" />
        </svg>
      </p>
      {hud.tiebreak.length > 1 && (
        <p className="sb__note" role="status">
          TIEBREAK:{' '}
          {hud.tiebreak.map((id) => hud.entries.find((e) => e.id === id)?.label).join(' and ')}
        </p>
      )}
      <ol className="sb__bands" aria-label="Scores">
        {bySeat.map((entry) => (
          <Band
            key={entry.id}
            entry={entry}
            target={target}
            leader={best > 0 && entry.kills === best}
            winner={winnerId === undefined ? undefined : entry.id === winnerId}
          />
        ))}
      </ol>
      {showContinue && (
        <button type="button" className="sb__continue" onClick={onContinue} {...proceed}>
          CONTINUE
        </button>
      )}
    </section>
  );
}

function Band({
  entry,
  target,
  leader,
  winner,
}: {
  readonly entry: ScoreEntryView;
  readonly target: number;
  readonly leader: boolean;
  /** The final scoreboard: true for the winner, false for everyone else; undefined between rounds. */
  readonly winner: boolean | undefined;
}) {
  const character = characterOf(SEAT_ROSTER, entry);
  const colours = scoreboardColours(character);
  const style = {
    '--band': colours.band,
    '--filled': colours.filled,
    '--empty': colours.empty,
  } as CSSProperties;
  return (
    <li
      className="sb__band"
      data-winner={winner === true || undefined}
      data-faded={winner === false || undefined}
      style={style}
      aria-label={`${entry.label}: ${entry.kills} of ${target} kills${leader ? ', leading' : ''}`}
    >
      <span className="sb__badge" aria-hidden="true">
        {entry.cpu ? 'BOT' : `P${entry.number}`}
      </span>
      <span className="sb__portrait" aria-hidden="true">
        <img src={`characters/${character}.webp`} alt="" draggable={false} />
        {leader && <span className="sb__crown">♛</span>}
      </span>
      <span className="sb__dots" aria-hidden="true">
        {Array.from({ length: target }, (_, i) => (
          <span key={i} className="sb__dot" data-filled={i < entry.kills || undefined} />
        ))}
      </span>
    </li>
  );
}
