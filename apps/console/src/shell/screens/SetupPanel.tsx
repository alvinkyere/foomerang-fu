import type { CharacterSelectView, SelectSeatView } from '../model';

/** The video's GAME MODE card icons (a crowned robot, a heart with a face, a boomerang), drawn in the card's colour. */
function ModeIcon({ id }: { readonly id: string }) {
  if (id === 'TEAM_UP')
    return (
      <svg viewBox="0 0 64 64" className="cs__mode-icon" aria-hidden="true">
        <path d="M32 56C10 40 6 28 10 19c4-9 16-9 22 0 6-9 18-9 22 0 4 9 0 21-22 37Z" />
        <circle cx="24" cy="28" r="3.2" className="cs__mode-eye" />
        <circle cx="40" cy="28" r="3.2" className="cs__mode-eye" />
        <path d="M27 36q5 5 10 0" className="cs__mode-mouth" />
      </svg>
    );
  if (id === 'GOLDEN_BOOMERANG')
    return (
      <svg viewBox="0 0 64 64" className="cs__mode-icon" aria-hidden="true">
        <path d="M10 36c4-12 18-20 36-18 4 0 6 4 3 6-10 2-16 8-18 18-1 4-6 4-8 1Z" />
        <path d="M30 6l-3 8M44 8l-5 7M54 18l-8 3" className="cs__mode-spark" />
      </svg>
    );
  return (
    <svg viewBox="0 0 64 64" className="cs__mode-icon" aria-hidden="true">
      <path d="M16 20l6 6 10-12 10 12 6-6v10H16Z" />
      <rect x="12" y="30" width="40" height="24" rx="8" />
      <circle cx="25" cy="42" r="3.4" className="cs__mode-eye" />
      <circle cx="39" cy="42" r="3.4" className="cs__mode-eye" />
    </svg>
  );
}

/** The banners of PICK TEAMS: a red one with a skull, a blue one with a leaf wreath. */
function Banner({ side }: { readonly side: 'RED' | 'BLUE' }) {
  return (
    <svg
      viewBox="0 0 60 84"
      className={`cs__banner cs__banner--${side.toLowerCase()}`}
      aria-hidden="true"
    >
      <path d="M2 2h56v80l-28-16L2 82Z" className="cs__banner-cloth" />
      {side === 'RED' ? (
        <g className="cs__banner-mark">
          <circle cx="30" cy="30" r="11" />
          <rect x="24" y="38" width="12" height="8" rx="2" />
          <circle cx="26" cy="30" r="2.6" className="cs__banner-hole" />
          <circle cx="34" cy="30" r="2.6" className="cs__banner-hole" />
        </g>
      ) : (
        <g className="cs__banner-mark">
          <path d="M30 18c8 4 12 12 10 22-3 4-7 5-10 4-3 1-7 0-10-4-2-10 2-18 10-22Z" />
          <path d="M30 22v22" className="cs__banner-hole" />
        </g>
      )}
    </svg>
  );
}

/** GAME MODE, PICK TEAMS, READY? under the circles (ff physics hq 2.mp4 9:38-9:50; game-setting.mp4). */
export function SetupPanel({
  select,
  onPress,
  onHover,
  canStart,
}: {
  readonly select: CharacterSelectView;
  readonly onPress: () => void;
  readonly onHover?: ((index: number) => void) | undefined;
  readonly canStart: boolean | undefined;
}) {
  const setup = select.setup;
  if (setup === undefined || setup.stage === 'CHARACTERS') return null;
  const title =
    setup.stage === 'MODE' ? 'GAME MODE' : setup.stage === 'TEAMS' ? 'PICK TEAMS' : 'READY?';
  const people = select.seats.filter((s) => s.kind !== 'empty');
  const red = people.filter((s) => s.side === 'RED');
  const blue = people.filter((s) => s.side === 'BLUE');
  const middle = people.filter((s) => s.side === undefined);
  const tile = (s: SelectSeatView) => (
    <span key={s.slot} className="cs__team-tile" aria-label={`Player ${s.number}`}>
      <img src={s.character?.motion?.still ?? s.character?.portrait} alt="" draggable={false} />
    </span>
  );
  return (
    <section className="cs__setup" data-stage={setup.stage} aria-label={title}>
      <h1 className="cs__divider cs__divider--setup">
        <span>{title}</span>
      </h1>
      {setup.stage === 'MODE' && (
        <div className="cs__modes" role="listbox" aria-label="Game modes">
          {setup.cards.map((card, i) => (
            <button
              key={card.id}
              type="button"
              role="option"
              aria-selected={i === setup.hover}
              aria-disabled={!card.available || undefined}
              className="cs__mode"
              data-on={i === setup.hover || undefined}
              data-soon={!card.available || undefined}
              onMouseEnter={() => onHover?.(i)}
              onClick={() => {
                onHover?.(i);
                onPress();
              }}
            >
              <ModeIcon id={card.id} />
              <span className="cs__mode-name">{card.title.toUpperCase()}</span>
              <span className="cs__mode-caption">{i === setup.hover ? card.caption : ''}</span>
            </button>
          ))}
        </div>
      )}
      {setup.stage === 'TEAMS' && (
        <div className="cs__teams">
          <div className="cs__team cs__team--red">
            <Banner side="RED" />
            <span className="cs__team-slots" data-testid="team-red">
              {red.map(tile)}
            </span>
          </div>
          <div className="cs__team-middle">
            {middle.length > 0 ? (
              <>
                <span className="cs__arrow" aria-hidden="true">
                  ‹
                </span>
                <span className="cs__team-slots cs__team-slots--middle">{middle.map(tile)}</span>
                <span className="cs__arrow" aria-hidden="true">
                  ›
                </span>
              </>
            ) : (
              setup.teamsValid && (
                <button type="button" className="cs__pill cs__pill--go" onClick={onPress}>
                  CONTINUE
                </button>
              )
            )}
          </div>
          <div className="cs__team cs__team--blue">
            <span className="cs__team-slots" data-testid="team-blue">
              {blue.map(tile)}
            </span>
            <Banner side="BLUE" />
          </div>
        </div>
      )}
      {setup.stage === 'READY' && (
        <div className="cs__ready">
          <span className="cs__pill cs__pill--soon">MODIFIERS</span>
          <span className="cs__fight">
            <button
              type="button"
              className="cs__pill cs__pill--go"
              aria-disabled={canStart === false || undefined}
              onClick={onPress}
            >
              FIGHT!
            </button>
            <span className="cs__fight-caption">LET’S GO!</span>
          </span>
        </div>
      )}
      <p className="cs__confirm" aria-hidden="true">
        CONFIRM <kbd className="cs__glyph cs__glyph--select">SELECT</kbd>
      </p>
    </section>
  );
}
