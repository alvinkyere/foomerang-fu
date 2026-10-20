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
 * round. Presentation only: the kills and the wait are the rules' facts.
 */
export function Scoreboard({
  hud,
  onContinue,
}: {
  readonly hud: HudView;
  readonly onContinue: () => void;
}) {
  const { target } = hud;
  if (target === undefined) return null;
  return (
    <FocusScope id="scoreboard" initialFocus="continue" remember={false}>
      <Board hud={hud} target={target} onContinue={onContinue} />
    </FocusScope>
  );
}

const SEAT_ROSTER = RECONSTRUCTED_MAPS.market_plaza.roster;

function Board({
  hud,
  target,
  onContinue,
}: {
  readonly hud: HudView;
  readonly target: number;
  readonly onContinue: () => void;
}) {
  const proceed = useFocusItem<HTMLButtonElement>('continue');
  const best = Math.max(0, ...hud.entries.map((e) => e.kills));
  const bySeat = [...hud.entries].sort((a, b) => a.number - b.number);
  return (
    <section className="sb" role="dialog" aria-label="Scoreboard">
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
          />
        ))}
      </ol>
      <button type="button" className="sb__continue" onClick={onContinue} {...proceed}>
        CONTINUE
      </button>
    </section>
  );
}

function Band({
  entry,
  target,
  leader,
}: {
  readonly entry: ScoreEntryView;
  readonly target: number;
  readonly leader: boolean;
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
