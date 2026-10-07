import { useEffect, useState } from 'react';
import { Character, type CharacterId } from '../components/Characters';
import { FocusScope } from '../focus/FocusManager';
import { GameCarousel } from '../components/GameCarousel';
import { GameTile } from '../components/GameTile';
import { Icon, type IconName } from '../components/Icon';
import { SystemAction, SystemBar } from '../components/SystemAction';
import { GAMES, type CatalogGame } from '../catalog';
import { Wordmark } from './Wordmark';

export type SystemDestination = 'players' | 'controllers' | 'settings' | 'help' | 'about';

export const SYSTEM_ACTIONS = [
  { id: 'players', label: 'Players', icon: 'players', accent: 'var(--coral)' },
  { id: 'controllers', label: 'Controllers', icon: 'controllers', accent: 'var(--teal)' },
  { id: 'settings', label: 'Settings', icon: 'settings', accent: 'var(--violet)' },
  { id: 'help', label: 'Help', icon: 'help', accent: 'var(--sky)' },
  { id: 'about', label: 'About', icon: 'about', accent: 'var(--lime)' },
] as const satisfies readonly {
  id: SystemDestination;
  label: string;
  icon: IconName;
  accent: string;
}[];

export interface Profile {
  readonly name: string;
  readonly role: string;
  readonly character: CharacterId;
}

export function ProfileChip({ profile }: { readonly profile: Profile }) {
  return (
    <div className="profile">
      <span className="profile__avatar">
        <Character id={profile.character} />
      </span>
      <span>
        <div className="profile__name">{profile.name}</div>
        <div className="profile__role">{profile.role}</div>
      </span>
    </div>
  );
}

export function StatusCluster({
  ready,
  readyLabel,
  clock,
}: {
  readonly ready: boolean;
  readonly readyLabel: string;
  readonly clock: string;
}) {
  return (
    <div className="sysstatus">
      <span className="sysstatus__item">
        <span
          className={`sysstatus__dot${ready ? '' : ' sysstatus__dot--warn'}`}
          aria-hidden="true"
        />
        <Icon name="phone" />
        <span>{readyLabel}</span>
      </span>
      <span className="sysstatus__item sysstatus__clock">{clock}</span>
    </div>
  );
}

function GameInfo({ game }: { readonly game: CatalogGame }) {
  return (
    <div className="info" key={game.id}>
      {game.comingSoon ? (
        <p className="info__blurb">{game.tagline}</p>
      ) : (
        <>
          <span className="pill">
            <Icon name="players" />
            {game.players}
          </span>
          <span className="pill">
            <Icon name="phone" />
            Phones are the controllers
          </span>
          <p className="info__blurb">{game.tagline}</p>
        </>
      )}
    </div>
  );
}

export interface HomeScreenProps {
  readonly selectedId: string;
  readonly onSelectedChange: (id: string) => void;
  readonly onOpenGame: (game: CatalogGame) => void;
  readonly onSystem: (destination: SystemDestination) => void;
}

/** The console home: the library, what is selected, and the system row. One deterministic focus: the first game. */
export function HomeScreen({
  selectedId,
  onSelectedChange,
  onOpenGame,
  onSystem,
}: HomeScreenProps) {
  const selectedIndex = Math.max(
    0,
    GAMES.findIndex((g) => g.id === selectedId),
  );
  const selected = GAMES[selectedIndex] as CatalogGame;
  return (
    <FocusScope id="home" initialFocus={`tile-${GAMES[0]?.id}`}>
      <div className="homescreen">
        <section className="home__library" aria-label="Games">
          <GameCarousel selectedIndex={selectedIndex}>
            {GAMES.map((game) => (
              <GameTile
                key={game.id}
                id={`tile-${game.id}`}
                title={game.title}
                art={game.art}
                comingSoon={game.comingSoon === true}
                width={game.comingSoon ? 'square' : 'wide'}
                onFocus={() => onSelectedChange(game.id)}
                onSelect={() => onOpenGame(game)}
              >
                {!game.comingSoon && <Wordmark size="sm" />}
              </GameTile>
            ))}
          </GameCarousel>
          <GameInfo game={selected} />
        </section>
        <SystemBar>
          {SYSTEM_ACTIONS.map((action) => (
            <SystemAction
              key={action.id}
              id={`sys-${action.id}`}
              label={action.label}
              icon={action.icon}
              accent={action.accent}
              onSelect={() => onSystem(action.id)}
            />
          ))}
        </SystemBar>
      </div>
    </FocusScope>
  );
}

/** A live clock, local time, no seconds. */
export function useClock(now: () => Date = () => new Date()): string {
  const format = () =>
    now()
      .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      .replace(/\s?[AP]M$/i, '');
  const [text, setText] = useState(format);
  useEffect(() => {
    const t = setInterval(() => setText(format()), 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return text;
}
