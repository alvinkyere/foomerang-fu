import { Button } from '../components/Button';
import { Character } from '../components/Characters';
import { Icon } from '../components/Icon';
import { FocusScope } from '../focus/FocusManager';
import type { CatalogGame } from '../catalog';
import { Wordmark } from './Wordmark';

export interface GameDetailScreenProps {
  readonly game: CatalogGame;
  /** Creating the room: PLAY shows its loading state and cannot be pressed twice. */
  readonly starting: boolean;
  readonly onPlay: () => void;
  readonly onHowToPlay: () => void;
  readonly onGameSettings: () => void;
  readonly onBack: () => void;
}

/** One game, focused. PLAY is the default focus and the loudest thing on screen. */
export function GameDetailScreen({
  game,
  starting,
  onPlay,
  onHowToPlay,
  onGameSettings,
  onBack,
}: GameDetailScreenProps) {
  return (
    <FocusScope id="detail" initialFocus="play" remember={false} onBack={onBack}>
      <div className="detail">
        <div className="detail__art" aria-hidden="true">
          {game.art !== undefined && <img src={game.art} alt="" draggable={false} />}
          <div className="detail__cast">
            <Character id="bread" />
            <Character id="coffee" />
            <Character id="orange" />
            <Character id="fruit" />
          </div>
        </div>
        <div className="detail__side">
          <Wordmark size="lg" />
          <p className="detail__tag">{game.tagline}</p>
          <div className="detail__pills">
            <span className="pill">
              <Icon name="players" />
              {game.players}
            </span>
            <span className="pill">
              <Icon name="phone" />
              Phones are the controllers
            </span>
          </div>
          <div className="detail__actions">
            <Button
              id="play"
              variant="primary"
              size="l"
              icon="play"
              loading={starting}
              onPress={onPlay}
            >
              {starting ? 'Getting ready…' : 'PLAY'}
            </Button>
            <Button id="howto" icon="book" onPress={onHowToPlay}>
              How to Play
            </Button>
            <Button id="gamesettings" icon="settings" onPress={onGameSettings}>
              Game Settings
            </Button>
          </div>
        </div>
      </div>
    </FocusScope>
  );
}
