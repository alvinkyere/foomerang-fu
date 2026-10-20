import type { HudView, ScoreEntryView, ScoreEventView } from '../render/viewModel';

/** Which hole just changed on whose meter, for a moment: presentation of a rules fact, never a source of one. */
export interface Pulse {
  readonly kind: 'fill' | 'drain' | 'penalty';
  readonly hole: number;
  readonly key: string;
}

/** What a score event says, in words (the meter animation is a second, quieter signal). */
export function scoreToast(e: ScoreEventView): string {
  if (e.delta > 0) return `${e.label} +1 (${e.victimLabel})`;
  const why = e.reason === 'ENVIRONMENT' ? 'the floor' : 'self-kill';
  return e.delta < 0 ? `${e.label} −1 (${why})` : `${e.label}: ${why}, already at 0`;
}

/** Fourteen circles: filled for a kill, empty for a hole still to fill. Shape differs, not only colour. */
export function Meter({
  entry,
  target,
  pulse,
}: {
  readonly entry: ScoreEntryView;
  readonly target: number;
  readonly pulse?: Pulse | undefined;
}) {
  return (
    <span
      className="meter"
      role="img"
      aria-label={`${entry.label}: ${entry.kills} of ${target} kills`}
    >
      {Array.from({ length: target }, (_, i) => {
        const filled = i < entry.kills;
        const animated = pulse !== undefined && pulse.hole === i;
        return (
          <span
            key={animated ? `${i}:${pulse.key}` : i}
            className={`hole ${filled ? 'filled' : 'empty'}${animated ? ` ${pulse.kind}` : ''}`}
            style={filled ? { color: entry.color } : undefined}
            aria-hidden="true"
          >
            {filled ? '●' : '○'}
          </span>
        );
      })}
    </span>
  );
}

const Identity = ({ entry }: { readonly entry: ScoreEntryView }) => (
  <>
    <span className="marker" style={{ color: entry.color }} aria-hidden="true">
      {entry.marker}
    </span>
    <span className="player-number">{entry.number}</span>
    <span className="player-name">{entry.label.toUpperCase()}</span>
    {entry.cpu && <span className="muted cpu-tag">CPU</span>}
  </>
);

/**
 * The race while the arena is live: one slim row of players above the arena (never over it), each with their meter.
 * Kept small on purpose: the fight is the show; standings are shown big between rounds.
 */
export function ScoreStrip({
  hud,
  pulses,
}: {
  readonly hud: HudView;
  readonly pulses: Readonly<Record<string, Pulse>>;
}) {
  const { target } = hud;
  if (target === undefined) return null;
  return (
    <header className="score-strip" aria-label="Kill race">
      <p className="round-label" aria-label="Round">
        {hud.roundLabel}
      </p>
      <ul>
        {hud.entries.map((entry) => (
          <li key={entry.id}>
            <span className="who">
              <Identity entry={entry} />
            </span>
            <Meter entry={entry} target={target} pulse={pulses[entry.id]} />
            <span className="count">
              {entry.kills} / {target}
            </span>
          </li>
        ))}
      </ul>
    </header>
  );
}

/** Brief words for each change of a meter. */
export function ScoreToasts({ toasts }: { readonly toasts: readonly ScoreEventView[] }) {
  if (toasts.length === 0) return null;
  return (
    <ul className="score-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <li key={t.key} className={t.delta > 0 ? 'gain' : 'loss'}>
          {scoreToast(t)}
        </li>
      ))}
    </ul>
  );
}
