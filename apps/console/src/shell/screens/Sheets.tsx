import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { SettingsList, SettingsRow } from '../components/SettingsList';
import type { ShellFacts } from '../model';

/** The info sheets behind the system bar and the game page. Words and pictures only; no state of their own. */

export function HowToPlayList() {
  return (
    <ul className="howto">
      <li>
        <span className="key">THUMB</span>
        <span>
          <b>Steer</b>Slide your left thumb to run.
        </span>
      </li>
      <li>
        <span className="key">SLASH</span>
        <span>
          <b>Swing close</b>A well-timed slash bats an incoming boomerang away.
        </span>
      </li>
      <li>
        <span className="key">THROW</span>
        <span>
          <b>Boomerang</b>It flies, then comes home. You can’t slash while it’s out.
        </span>
      </li>
      <li>
        <span className="key">14</span>
        <span>
          <b>Win the race</b>Every knockout fills a circle. First to fill all 14 wins.
        </span>
      </li>
    </ul>
  );
}

function DoneButton({
  id,
  onPress,
  children = 'Got it',
}: {
  id: string;
  onPress: () => void;
  children?: string;
}) {
  return (
    <Button id={id} variant="primary" onPress={onPress}>
      {children}
    </Button>
  );
}

export function HowToPlaySheet({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  return (
    <Modal
      id="howto"
      open={open}
      title="How to Play"
      onClose={onClose}
      initialFocus="howto-done"
      footer={<DoneButton id="howto-done" onPress={onClose} />}
    >
      <HowToPlayList />
    </Modal>
  );
}

export function GameSettingsSheet({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  return (
    <Modal
      id="gamesettings"
      open={open}
      title="Game Settings"
      onClose={onClose}
      initialFocus="gs-mode"
      footer={<DoneButton id="gs-done" onPress={onClose} children="Done" />}
    >
      <SettingsList label="Game settings">
        <SettingsRow id="gs-mode" label="Game Mode" value="Free For All" kind="info" />
        <SettingsRow id="gs-kills" label="Kills To Win" value="14" kind="info" />
        <SettingsRow id="gs-hide" label="Hide & Seek" value="Coming soon" kind="info" />
      </SettingsList>
    </Modal>
  );
}

export function ControllersSheet({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  return (
    <Modal
      id="controllers"
      open={open}
      title="Controllers"
      onClose={onClose}
      initialFocus="controllers-done"
      footer={<DoneButton id="controllers-done" onPress={onClose} children="Done" />}
    >
      <ol className="steps">
        <li>
          <Icon name="play" />
          <span>Pick a game and press PLAY to open a room.</span>
        </li>
        <li>
          <Icon name="phone" />
          <span>Scan the code with your phone’s camera. Turn the phone sideways.</span>
        </li>
        <li>
          <Icon name="controllers" />
          <span>Your phone is your controller. No app to install.</span>
        </li>
      </ol>
      <p className="modal__message">Phones that join are listed on the Players screen.</p>
    </Modal>
  );
}

export function PlayersSheet({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  return (
    <Modal
      id="players"
      open={open}
      title="Players"
      onClose={onClose}
      initialFocus="players-done"
      footer={<DoneButton id="players-done" onPress={onClose} children="OK" />}
    >
      <p className="modal__message">
        Nobody is here yet. Pick a game and press PLAY to open a room, then scan the code with your
        phone to join.
      </p>
    </Modal>
  );
}

export function HelpSheet({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  return (
    <Modal
      id="help"
      open={open}
      title="Help"
      onClose={onClose}
      initialFocus="help-done"
      footer={<DoneButton id="help-done" onPress={onClose} children="Done" />}
    >
      <HowToPlayList />
      <p className="modal__message modal__message--tight">
        On this screen: arrow keys or D-pad to move, Enter or A to choose, Esc or B to go back.
      </p>
    </Modal>
  );
}

export function AboutSheet({
  open,
  facts,
  onClose,
}: {
  readonly open: boolean;
  readonly facts: ShellFacts;
  readonly onClose: () => void;
}) {
  return (
    <Modal
      id="about"
      open={open}
      title="About Foomerang"
      onClose={onClose}
      initialFocus="about-done"
      footer={<DoneButton id="about-done" onPress={onClose} children="Done" />}
    >
      <p className="modal__message">
        Foomerang turns your phones into controllers for party games on the big screen.
      </p>
      <SettingsList label="About">
        <SettingsRow id="about-version" label="Version" value={facts.version} kind="info" />
        <SettingsRow id="about-build" label="Build" value={facts.build} kind="info" />
      </SettingsList>
    </Modal>
  );
}

export function FailureSheet({
  open,
  title,
  message,
  retry,
  onRetry,
  onClose,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly message: string;
  /** Offer Try again (a room that could not open); otherwise a single OK. */
  readonly retry: boolean;
  readonly onRetry: () => void;
  readonly onClose: () => void;
}) {
  return (
    <Modal
      id="failure"
      open={open}
      title={title}
      onClose={onClose}
      initialFocus={retry ? 'failure-retry' : 'failure-ok'}
      footer={
        retry ? (
          <>
            <Button id="failure-back" variant="secondary" onPress={onClose}>
              Back
            </Button>
            <Button id="failure-retry" variant="primary" onPress={onRetry}>
              Try again
            </Button>
          </>
        ) : (
          <Button id="failure-ok" variant="primary" onPress={onClose}>
            OK
          </Button>
        )
      }
    >
      <p className="modal__message" role="alert">
        {message}
      </p>
    </Modal>
  );
}
