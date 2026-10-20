import type { CSSProperties } from 'react';
import { characterName, resultsColour, resultsPanel } from '../characters/videoPalette';
import { RECONSTRUCTED_MAPS, characterOf } from '../render/reconstructed/maps';
import type { HudView, ScoreEntryView } from '../render/viewModel';
import { FocusScope, useFocusItem } from '../shell/focus/FocusManager';
import './results.css';

/**
 * The end of the match, as "foomerang fu results.jpg" shows it (owner, 2026-10-19): "<CHARACTER> WINS!", a column per player
 * in seat order (their character in a soft circle and a ribbon with their placing; the winner on a crimson panel, crowned),
 * and REMATCH / BACK TO MENU, operated by any phone's SELECT or the TV. Award pills under each column are a later slice.
 */
export function ResultsScreen({
  hud,
  waiting,
  onRematch,
  onLobby,
}: {
  readonly hud: HudView;
  readonly waiting: readonly string[];
  readonly onRematch: () => void;
  readonly onLobby: () => void;
}) {
  const { champion } = hud;
  if (champion === undefined) return null;
  return (
    <FocusScope id="results" initialFocus="rematch" remember={false}>
      <Results
        hud={hud}
        champion={champion}
        waiting={waiting}
        onRematch={onRematch}
        onLobby={onLobby}
      />
    </FocusScope>
  );
}

/**
 * Places by kills, best first: ties share a place and the next place skips (1, 2, 2, 2, 5). The winner is always first,
 * even level on kills with someone (a tiebreak decided it).
 */
export function placings(
  entries: readonly ScoreEntryView[],
  winnerId: string,
): ReadonlyMap<string, number> {
  const others = entries.filter((e) => e.id !== winnerId);
  const out = new Map<string, number>([[winnerId, 1]]);
  for (const e of others) out.set(e.id, 2 + others.filter((o) => o.kills > e.kills).length);
  return out;
}

const SEAT_ROSTER = RECONSTRUCTED_MAPS.market_plaza.roster;
const ORDINAL = (n: number): string =>
  n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;

function Results({
  hud,
  champion,
  waiting,
  onRematch,
  onLobby,
}: {
  readonly hud: HudView;
  readonly champion: ScoreEntryView;
  readonly waiting: readonly string[];
  readonly onRematch: () => void;
  readonly onLobby: () => void;
}) {
  const rematch = useFocusItem<HTMLButtonElement>('rematch');
  const lobby = useFocusItem<HTMLButtonElement>('lobby');
  const places = placings(hud.entries, champion.id);
  const bySeat = [...hud.entries].sort((a, b) => a.number - b.number);
  const winner = characterOf(SEAT_ROSTER, champion);
  return (
    <section
      className="rs"
      role="dialog"
      aria-label="Match over"
      style={{ '--n': bySeat.length } as CSSProperties}
    >
      <h2 className="rs__title">{characterName(winner).toUpperCase()} WINS!</h2>
      <ol className="rs__columns" aria-label="Results">
        {bySeat.map((entry) => {
          const character = characterOf(SEAT_ROSTER, entry);
          const place = places.get(entry.id) ?? bySeat.length;
          const won = entry.id === champion.id;
          return (
            <li
              key={entry.id}
              className="rs__column"
              data-winner={won || undefined}
              style={
                {
                  '--c': resultsColour(character),
                  '--panel': resultsPanel(character),
                } as CSSProperties
              }
              aria-label={`${entry.label}, ${characterName(character)}: ${won ? 'winner' : ORDINAL(place)}, ${entry.kills} kills`}
            >
              <span className="rs__circle" aria-hidden="true">
                <img src={`characters/${character}.webp`} alt="" draggable={false} />
                {won && <span className="rs__headcrown">♛</span>}
              </span>
              {won ? (
                <span className="rs__crown" aria-hidden="true">
                  ♛
                </span>
              ) : (
                <span className="rs__ribbon" aria-hidden="true">
                  {place}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {waiting.length > 0 && (
        <p className="rs__waiting">Waiting for the next match: {waiting.join(', ')}</p>
      )}
      <div className="rs__actions">
        <button type="button" className="rs__action" onClick={onRematch} {...rematch}>
          REMATCH
        </button>
        <button type="button" className="rs__action" onClick={onLobby} {...lobby}>
          BACK TO MENU
        </button>
      </div>
    </section>
  );
}
