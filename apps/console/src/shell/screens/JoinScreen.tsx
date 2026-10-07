import { useState } from 'react';
import { QrCode } from '../../ui/QrCode';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { PlayerTile } from '../components/PlayerTile';
import { FocusScope } from '../focus/FocusManager';
import type { JoinStatus, SeatView } from '../model';

export interface JoinScreenProps {
  readonly status: JoinStatus;
  readonly roomCode?: string | undefined;
  /** What a phone is sent to. Encoded in the QR. */
  readonly joinUrl?: string | undefined;
  /** The same, short, for people who cannot scan. */
  readonly shortAddress?: string | undefined;
  readonly seats: readonly SeatView[];
  readonly waitingForSeat?: readonly string[];
  readonly warnings?: readonly string[];
  /** This screen was reloaded and the match it was running is gone. */
  readonly interrupted?: boolean;
  readonly canStart: boolean;
  /** Plain words for why START is unavailable. */
  readonly startBlockedReason?: string | undefined;
  /** The server is starting the match: START shows its loading state. */
  readonly launching?: boolean;
  readonly canAddCpu: boolean;
  readonly onStart: () => void;
  readonly onAddCpu: () => void;
  readonly onCpuStep: (id: string, delta: 1 | -1) => void;
  readonly onCpuRemove: (id: string) => void;
  readonly onRetry: () => void;
  readonly onBack: () => void;
}

/** Players join here. The QR and the code are the biggest things on the screen; START takes over when it can. */
export function JoinScreen(props: JoinScreenProps) {
  const { status, roomCode, joinUrl, seats, canStart } = props;
  const present = seats.filter((s) => s.kind !== 'empty').length;
  const hasCpu = seats.some((s) => s.kind === 'cpu');
  // Chosen once, when the screen opens: focus must never jump because someone else joined.
  const [initial] = useState(() => {
    const firstEmpty = seats.find((s) => s.kind === 'empty');
    return canStart || firstEmpty === undefined || !props.canAddCpu
      ? 'start'
      : `seat-${firstEmpty.slot}`;
  });
  const code = roomCode ?? '';

  return (
    <FocusScope id="join" initialFocus={initial} remember={false} onBack={props.onBack}>
      <div className="joinscreen">
        <section className="join__left" aria-label="How to join">
          <h1 className="join__title">
            SCAN WITH YOUR PHONE <em>TO JOIN</em>
          </h1>
          <p className="join__sub">Your phone becomes your controller. Turn it sideways.</p>
          {props.warnings?.map((warning) => (
            <div key={warning} className="alertbar alertbar--warn" role="alert" title={warning}>
              <Icon name="warning" />
              <span className="alertbar__text">{warning}</span>
            </div>
          ))}
          {status === 'reconnecting' && (
            <div className="alertbar" role="status">
              <span className="spinner" aria-hidden="true" />
              Reconnecting… your room is still here.
            </div>
          )}
          {props.interrupted === true && (
            <div className="alertbar alertbar--info" role="status">
              <Icon name="about" />
              The last match ended because this screen was reloaded.
            </div>
          )}
          <div className="join__qrrow">
            {status === 'loading' && (
              <div className="qrcard qrcard--empty" role="status">
                <span className="spinner" aria-hidden="true" />
                <span>Getting your room ready…</span>
              </div>
            )}
            {status === 'error' && (
              <div className="qrcard qrcard--empty" role="alert">
                <Icon name="warning" />
                <span>We couldn’t open a room.</span>
                <Button id="retry" variant="primary" onPress={props.onRetry}>
                  Try again
                </Button>
              </div>
            )}
            {(status === 'ready' || status === 'reconnecting') && joinUrl !== undefined && (
              <div className="qrcard">
                <QrCode value={joinUrl} label={`QR code to join room ${code} from a phone`} />
              </div>
            )}
            <div className="join__code">
              <span className="join__codelabel">ROOM CODE</span>
              <span
                className="join__codevalue"
                data-testid="room-code"
                aria-label={`Room code ${code.split('').join(' ')}`}
              >
                <span aria-hidden="true">{code.slice(0, 3) || '···'}</span>
                <span aria-hidden="true">{code.slice(3) || '···'}</span>
              </span>
              {props.shortAddress !== undefined && (
                <p className="join__or">
                  No camera? Open <b data-testid="join-address">{props.shortAddress}</b> on your
                  phone and type the code.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="join__right" aria-label="Players">
          <div className="join__head">
            <h2 className="join__heading">Players</h2>
            <span className="join__count">
              <b>{present}</b> of 6 · Free For All
            </span>
          </div>
          <div className="seats">
            {seats.map((seat) => (
              <PlayerTile
                key={seat.slot}
                id={`seat-${seat.slot}`}
                color={seat.color}
                number={seat.number}
                marker={seat.marker}
                kind={seat.kind}
                {...(seat.name !== undefined ? { name: seat.name } : {})}
                {...(seat.character !== undefined ? { character: seat.character } : {})}
                {...(seat.status !== undefined ? { status: seat.status } : {})}
                {...(seat.detail !== undefined ? { detail: seat.detail } : {})}
                {...(seat.kind === 'empty' && props.canAddCpu
                  ? { onSelect: props.onAddCpu, actionHint: 'Select to add a CPU' }
                  : {})}
                {...(seat.kind === 'cpu' && seat.id !== undefined
                  ? {
                      onSelect: () => props.onCpuRemove(seat.id as string),
                      onStep: (d: 1 | -1) => props.onCpuStep(seat.id as string, d),
                    }
                  : {})}
              />
            ))}
          </div>
          {props.waitingForSeat !== undefined && props.waitingForSeat.length > 0 && (
            <p className="join__tip join__tip--warn" role="status">
              <Icon name="warning" />
              No seat for {props.waitingForSeat.join(', ')}: remove a CPU to make room.
            </p>
          )}
          {hasCpu && (
            <p className="join__tip">CPU players: ◀ ▶ changes their level, Select removes them.</p>
          )}
          <div className="join__start">
            <Button
              id="start"
              variant="primary"
              size="l"
              icon="play"
              disabled={!canStart || status === 'loading' || status === 'error'}
              loading={props.launching === true}
              describedBy="start-why"
              onPress={props.onStart}
            >
              START GAME
            </Button>
            <p className="join__why" id="start-why">
              {!canStart && props.startBlockedReason !== undefined && (
                <>
                  <Icon name="warning" />
                  {props.startBlockedReason}
                </>
              )}
            </p>
          </div>
        </section>
      </div>
    </FocusScope>
  );
}
