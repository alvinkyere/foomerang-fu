import { useCallback, useEffect, useRef, useState } from 'react';
import { GAMES, type CatalogGame } from './catalog';
import {
  ConfirmDialog,
  ConsoleShell,
  ControlHintBar,
  Icon,
  ScreenTransition,
  useToast,
  type Hint,
  type TransitionDirection,
} from './components';
import type { ShellActions, ShellModel } from './model';
import { GameDetailScreen } from './screens/GameDetailScreen';
import {
  HomeScreen,
  ProfileChip,
  StatusCluster,
  useClock,
  type SystemDestination,
} from './screens/HomeScreen';
import { JoinScreen } from './screens/JoinScreen';
import { SettingsScreen, type CategoryId } from './screens/SettingsScreen';
import {
  AboutSheet,
  ControllersSheet,
  FailureSheet,
  GameSettingsSheet,
  HelpSheet,
  HowToPlaySheet,
  PlayersSheet,
} from './screens/Sheets';
import { useSettings } from './useSettings';

export type Screen = 'home' | 'detail' | 'settings' | 'join';
type Sheet = 'howto' | 'gamesettings' | 'controllers' | 'players' | 'help' | 'about' | 'leave';

/** Where to start, for the isolated UI harness and review screenshots. The real app passes nothing. */
export interface InitialView {
  readonly screen?: Screen;
  readonly sheet?: Sheet;
  readonly category?: CategoryId;
  readonly selected?: string;
}

export interface ConsoleAppProps {
  readonly model: ShellModel;
  readonly actions: ShellActions;
  readonly initial?: InitialView;
}

/**
 * The console's navigation and screens. It knows the model and the actions and nothing else: it
 * never reads the session, so the same component runs on real state (adapter) and on fixtures (harness).
 */
export function ConsoleApp({ model, actions, initial }: ConsoleAppProps) {
  const { room, failure } = model;
  const toast = useToast();
  const clock = useClock();
  const [settings, setSettings] = useSettings();
  const roomLive = room.phase === 'open' || room.phase === 'reconnecting';

  const [screen, setScreen] = useState<Screen>(initial?.screen ?? (roomLive ? 'join' : 'home'));
  const [direction, setDirection] = useState<TransitionDirection>('fade');
  const [selectedId, setSelectedId] = useState(initial?.selected ?? GAMES[0]?.id ?? '');
  const [openGame, setOpenGame] = useState<CatalogGame>(GAMES[0] as CatalogGame);
  const [sheet, setSheet] = useState<Sheet | null>(initial?.sheet ?? null);

  const go = useCallback((next: Screen, dir: TransitionDirection) => {
    setDirection(dir);
    setScreen(next);
  }, []);

  // The room drives where you are: a room that opens (or is reclaimed after a reload) puts you on
  // Join; a room that goes away takes you home. Adjusted while rendering, not in an effect, so there
  // is never a frame on the wrong screen.
  const roomKey = `${roomLive}/${room.phase === 'opening'}`;
  const [seenRoomKey, setSeenRoomKey] = useState(roomKey);
  if (seenRoomKey !== roomKey) {
    setSeenRoomKey(roomKey);
    if (roomLive && (screen === 'home' || screen === 'detail')) go('join', 'forward');
    else if (!roomLive && room.phase !== 'opening' && screen === 'join') go('home', 'back');
  }

  // A refusal that did not end anything (e.g. START with too few players) is said once.
  const lastNotice = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (room.notice !== undefined && room.notice !== lastNotice.current) toast(room.notice, 'bad');
    lastNotice.current = room.notice;
  }, [room.notice, toast]);

  const selected = GAMES.find((g) => g.id === selectedId) ?? (GAMES[0] as CatalogGame);
  const artGame = screen === 'home' ? selected : openGame;

  const onSystem = (destination: SystemDestination): void => {
    if (destination === 'settings') go('settings', 'forward');
    else if (destination === 'players') {
      if (roomLive) go('join', 'forward');
      else setSheet('players');
    } else setSheet(destination);
  };

  const hints: Hint[] =
    screen === 'home'
      ? [
          { action: 'move', label: 'Browse' },
          { action: 'move-v', label: 'Menu' },
          { action: 'select', label: 'Open' },
        ]
      : screen === 'detail'
        ? [
            { action: 'move-v', label: 'Move' },
            { action: 'select', label: 'Select' },
            { action: 'back', label: 'Back' },
          ]
        : screen === 'settings'
          ? [
              { action: 'move-v', label: 'Move' },
              { action: 'move', label: 'Change' },
              { action: 'back', label: 'Back' },
            ]
          : [
              { action: 'move', label: 'Move' },
              { action: 'select', label: 'Select' },
              { action: 'back', label: 'Close Room' },
            ];

  const statusCluster = (
    <StatusCluster
      ready={roomLive}
      readyLabel={
        roomLive
          ? `Room open · ${room.phones} ${room.phones === 1 ? 'phone' : 'phones'}`
          : 'No room open'
      }
      clock={clock}
    />
  );
  const top =
    screen === 'home' || screen === 'detail' ? (
      <>
        <ProfileChip profile={{ name: 'Living Room', role: 'Host', character: 'bread' }} />
        {statusCluster}
      </>
    ) : screen === 'settings' ? (
      <>
        <span className="crumb">
          <Icon name="back" />
          Settings
        </span>
        {statusCluster}
      </>
    ) : (
      <>
        <span className="crumb">
          <Icon name="back" />
          Foomerang Fu <span className="crumb__sep">/</span> Players
          <span className="crumb__chip">Free For All</span>
        </span>
        {statusCluster}
      </>
    );

  const joinStatus =
    room.phase === 'reconnecting' ? 'reconnecting' : room.phase === 'opening' ? 'loading' : 'ready';
  const closeSheet = (): void => setSheet(null);
  const failureOpensRoom = failure !== undefined && room.phase === 'none';

  return (
    <>
      <ConsoleShell
        artwork={artGame.art}
        artworkKey={artGame.art === undefined ? 'plain' : artGame.id}
        top={top}
        bottom={<ControlHintBar hints={hints} style={settings.controlHints} />}
      >
        <ScreenTransition screenKey={screen} direction={direction}>
          {screen === 'home' && (
            <HomeScreen
              selectedId={selectedId}
              onSelectedChange={setSelectedId}
              onOpenGame={(game) => {
                if (game.comingSoon === true) toast('Coming soon. More games are on the way.');
                else {
                  setOpenGame(game);
                  go('detail', 'forward');
                }
              }}
              onSystem={onSystem}
            />
          )}
          {screen === 'detail' && (
            <GameDetailScreen
              game={openGame}
              starting={room.phase === 'opening'}
              onPlay={actions.openRoom}
              onHowToPlay={() => setSheet('howto')}
              onGameSettings={() => setSheet('gamesettings')}
              onBack={() => go('home', 'back')}
            />
          )}
          {screen === 'settings' && (
            <SettingsScreen
              settings={settings}
              {...(initial?.category ? { initialCategory: initial.category } : {})}
              facts={{
                phonesConnected: room.phones,
                phoneAddress: model.facts.phoneAddress,
                connection: model.facts.connection,
                addressNote: model.facts.addressNote,
                version: model.facts.version,
                build: model.facts.build,
              }}
              onChange={setSettings}
              onBack={() => go('home', 'back')}
            />
          )}
          {screen === 'join' && (
            <JoinScreen
              status={joinStatus}
              roomCode={room.code}
              joinUrl={room.joinUrl}
              shortAddress={room.shortAddress}
              seats={room.seats}
              waitingForSeat={room.waitingForSeat}
              warnings={model.warnings}
              interrupted={room.interrupted}
              canStart={room.canStart}
              startBlockedReason={room.startBlockedReason}
              launching={room.launching}
              canAddCpu={room.canAddCpu}
              onStart={actions.start}
              onAddCpu={actions.addCpu}
              onCpuStep={actions.stepCpu}
              onCpuRemove={actions.removeCpu}
              onRetry={actions.openRoom}
              onBack={() => setSheet('leave')}
            />
          )}
        </ScreenTransition>
      </ConsoleShell>

      <HowToPlaySheet open={sheet === 'howto'} onClose={closeSheet} />
      <GameSettingsSheet open={sheet === 'gamesettings'} onClose={closeSheet} />
      <ControllersSheet open={sheet === 'controllers'} onClose={closeSheet} />
      <PlayersSheet open={sheet === 'players'} onClose={closeSheet} />
      <HelpSheet open={sheet === 'help'} onClose={closeSheet} />
      <AboutSheet open={sheet === 'about'} facts={model.facts} onClose={closeSheet} />
      <ConfirmDialog
        id="leave"
        open={sheet === 'leave'}
        title="Close this room?"
        message="Everyone will be disconnected and sent back to their phone’s start screen."
        confirmLabel="Close Room"
        destructive
        onCancel={closeSheet}
        onConfirm={() => {
          closeSheet();
          actions.closeRoom();
        }}
      />
      <FailureSheet
        open={failure !== undefined}
        title={failure?.title ?? ''}
        message={failure?.message ?? ''}
        retry={failureOpensRoom}
        onRetry={actions.openRoom}
        onClose={actions.dismissFailure}
      />
    </>
  );
}
