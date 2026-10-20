import { useState, type CSSProperties } from 'react';
import { arrivalSide, type ArrivalSide } from '../../characters/selectAnimation';
import { SelectSprite } from '../components/SelectSprite';
import { QrCode } from '../../ui/QrCode';
import { useFocusItem } from '../focus/FocusManager';
import { FocusScope } from '../focus/FocusManager';
import type { CharacterSelectView, JoinStatus, SelectSeatView, SelectTileView } from '../model';
import './characterSelect.css';

export interface CharacterSelectScreenProps {
  readonly select: CharacterSelectView;
  readonly status: JoinStatus;
  readonly roomCode?: string | undefined;
  readonly joinUrl?: string | undefined;
  readonly shortAddress?: string | undefined;
  /** Configuration problems (a QR a phone could never reach). */
  readonly warnings?: readonly string[];
  /** This screen was reloaded and the match it was running is gone. */
  readonly interrupted?: boolean;
  /** People in the room with no seat (the table is full). */
  readonly waitingForSeat?: readonly string[];
  readonly canStart: boolean;
  readonly startBlockedReason?: string | undefined;
  readonly launching?: boolean;
  readonly onBegin: () => void;
  readonly onStepBots: (delta: 1 | -1) => void;
  readonly onCpuStep: (id: string, delta: 1 | -1) => void;
  readonly onCpuRemove: (id: string) => void;
  readonly onBack: () => void;
}

/**
 * The READY fill's outline: the video's painted disc has a softly scalloped edge, twelve gentle lobes (owner's spec). A
 * 100×100 SVG path, computed once.
 */
const SCALLOP = (() => {
  const points = Array.from({ length: 144 }, (_, i) => {
    const a = (i / 144) * Math.PI * 2;
    const r = 47.5 + 1.5 * Math.cos(12 * a);
    return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
  });
  return `M${points.join('L')}Z`;
})();

/** A character with no model yet (coming soon): a muted silhouette, never a broken image. */
const ComingSoon = ({ big = false }: { readonly big?: boolean }) => (
  <span className={big ? 'cs__soon cs__soon--big' : 'cs__soon'} aria-hidden="true">
    <span className="cs__soon-mark">?</span>
    <span className="cs__soon-text">COMING SOON</span>
  </span>
);

/** The four corner brackets of the video's frame. */
const Corners = () => (
  <>
    {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
      <span key={corner} className={`cs__corner cs__corner--${corner}`} aria-hidden="true" />
    ))}
  </>
);

const botsLabel = (n: number): string => (n === 0 ? 'NO BOTS' : n === 1 ? '1 BOT' : `${n} BOTS`);

/** The phone's own word for its SLASH button here (its screen says SELECT), in the video's green button. */
const SelectGlyph = () => <kbd className="cs__glyph cs__glyph--select">SELECT</kbd>;

/**
 * Character select, as in the reference video (game-setting.mp4): a circle per seat at the top, one grid of characters
 * below, and every phone moving its OWN cursor over it (the host routes each phone here, not to the shared focus). SELECT
 * readies a player on their character; once nobody is still choosing, the begin bar appears. The TV's own controls (keyboard,
 * mouse) reach the bar and the CPUs; BACK on the TV closes the room (never a phone's).
 */
export function CharacterSelectScreen(props: CharacterSelectScreenProps) {
  const { select } = props;
  const code = props.roomCode ?? '';
  const order = select.grid.flat().map((tile) => tile.character.id);
  const cols = select.grid[0]?.length ?? 1;
  return (
    <FocusScope id="select" initialFocus="begin" remember={false} onBack={props.onBack}>
      <div className="cs" data-testid="character-select">
        <Corners />
        <div className="cs__notices">
          {props.warnings?.map((warning) => (
            <p key={warning} className="cs__notice cs__notice--warn" role="alert" title={warning}>
              {warning}
            </p>
          ))}
          {props.status === 'reconnecting' && (
            <p className="cs__notice" role="status">
              Reconnecting… your room is still here.
            </p>
          )}
          {props.interrupted === true && (
            <p className="cs__notice" role="status">
              The last match ended because this screen was reloaded.
            </p>
          )}
          {props.waitingForSeat !== undefined && props.waitingForSeat.length > 0 && (
            <p className="cs__notice cs__notice--warn" role="status">
              No seat for {props.waitingForSeat.join(', ')}: remove a CPU to make room.
            </p>
          )}
        </div>
        <ol className="cs__seats" aria-label="Players">
          {select.seats.map((seat) => (
            <SeatCircle
              key={seat.slot}
              seat={seat}
              order={order}
              cols={cols}
              onCpuStep={props.onCpuStep}
              onCpuRemove={props.onCpuRemove}
            />
          ))}
        </ol>

        {!select.everyoneReady && (
          <h1 className="cs__divider">
            <span>CHOOSE CHARACTERS</span>
          </h1>
        )}
        {select.everyoneReady && (
          <BeginBar
            bots={select.bots}
            canAddBot={select.canAddBot}
            canStart={props.canStart}
            launching={props.launching === true}
            reason={props.startBlockedReason}
            onBegin={props.onBegin}
            onStepBots={props.onStepBots}
          />
        )}

        <div className="cs__grid" role="grid" aria-label="Characters">
          {select.grid.map((row, r) => (
            <div key={r} className="cs__row" role="row">
              {row.map((tile) => (
                <Tile key={tile.character.id} tile={tile} />
              ))}
            </div>
          ))}
        </div>

        <p className="cs__back" aria-hidden="true">
          <kbd className="cs__glyph cs__glyph--back">Esc</kbd>
          BACK
        </p>

        <aside className="cs__join" aria-label="How to join">
          {props.status === 'ready' && props.joinUrl !== undefined ? (
            <QrCode value={props.joinUrl} label={`QR code to join room ${code} from a phone`} />
          ) : (
            <span className="cs__join-wait" role="status">
              {props.status === 'reconnecting' ? 'Reconnecting…' : 'Getting your room ready…'}
            </span>
          )}
          <span className="cs__join-text">
            <span className="cs__join-title">SCAN TO JOIN</span>
            <span
              className="cs__join-code"
              data-testid="room-code"
              aria-label={`Room code ${code.split('').join(' ')}`}
            >
              {code}
            </span>
            {props.shortAddress !== undefined && (
              <span className="cs__join-or" data-testid="join-address">
                {props.shortAddress}
              </span>
            )}
          </span>
        </aside>
      </div>
    </FocusScope>
  );
}

/** The side a seat's character arrived from: kept per character, worked out when the cursor moves to a new one. */
function useArrival(
  id: string | undefined,
  order: readonly string[],
  cols: number,
): ArrivalSide | undefined {
  const [seen, setSeen] = useState<{ id: string | undefined; side: ArrivalSide | undefined }>({
    id,
    side: undefined,
  });
  if (seen.id !== id) {
    const side = id === undefined ? undefined : arrivalSide(order, seen.id, id, cols);
    setSeen({ id, side });
    return side;
  }
  return seen.side;
}

function SeatCircle({
  seat,
  order,
  cols,
  onCpuStep,
  onCpuRemove,
}: {
  readonly seat: SelectSeatView;
  /** The grid's characters in reading order, and its row length: which way a cursor moved. */
  readonly order: readonly string[];
  readonly cols: number;
  readonly onCpuStep: (id: string, delta: 1 | -1) => void;
  readonly onCpuRemove: (id: string) => void;
}) {
  const ch = seat.character;
  const arrival = useArrival(ch?.id, order, cols);
  const style = {
    '--badge': ch?.color ?? '#c9c4bf',
    '--tint': ch?.tint ?? 'transparent',
  } as CSSProperties;
  const label =
    seat.kind === 'empty'
      ? `Player ${seat.number}: empty, join from a phone`
      : `Player ${seat.number}: ${seat.name ?? ''}, ${ch?.name ?? ''}${seat.ready ? ', ready' : ', choosing'}`;
  return (
    <li
      className={`cs__seat cs__seat--${seat.kind}${seat.status === 'reconnecting' || seat.status === 'away' ? ' is-away' : ''}`}
      data-ready={seat.ready || undefined}
      style={style}
      aria-label={label}
    >
      <span className="cs__circle">
        {seat.ready && (
          <svg className="cs__scallop" viewBox="0 0 100 100" aria-hidden="true">
            <path d={SCALLOP} />
          </svg>
        )}
        {ch?.comingSoon === true ? (
          <ComingSoon big />
        ) : ch?.motion !== undefined ? (
          <SelectSprite
            key={ch.id}
            sheet={ch.motion.sheet}
            still={ch.motion.still}
            arrival={arrival}
            ready={seat.ready}
          />
        ) : ch !== undefined ? (
          <img className="cs__portrait" src={ch.portrait} alt="" draggable={false} />
        ) : (
          <span className="cs__joinword">JOIN</span>
        )}
      </span>
      <span className="cs__badge" aria-hidden="true">
        P{seat.number}
      </span>
      {seat.kind === 'phone' && !seat.ready && (
        <span className="cs__prompt" aria-hidden="true">
          <SelectGlyph />
          READY?
        </span>
      )}
      {seat.kind === 'cpu' && seat.id !== undefined && (
        <CpuControl
          id={seat.id}
          number={seat.number}
          name={seat.name ?? 'CPU'}
          detail={seat.detail ?? ''}
          onStep={(d) => onCpuStep(seat.id as string, d)}
          onRemove={() => onCpuRemove(seat.id as string)}
        />
      )}
    </li>
  );
}

/** A CPU's difficulty (◀ ▶ on the TV) and its removal (Select): the host's, not the phones'. */
function CpuControl({
  id,
  number,
  name,
  detail,
  onStep,
  onRemove,
}: {
  readonly id: string;
  readonly number: number;
  readonly name: string;
  readonly detail: string;
  readonly onStep: (d: 1 | -1) => void;
  readonly onRemove: () => void;
}) {
  const item = useFocusItem<HTMLButtonElement>(`cpu-${id}`, {
    onNavigate: (direction) => {
      if (direction === 'left') onStep(-1);
      else if (direction === 'right') onStep(1);
      else return false;
      return true;
    },
  });
  return (
    <button
      type="button"
      {...item}
      className="cs__cpu"
      aria-label={`Player ${number}: ${name}, ${detail}. Select removes it`}
      onClick={onRemove}
    >
      <span aria-hidden="true">‹</span> CPU · {detail} <span aria-hidden="true">›</span>
    </button>
  );
}

function BeginBar({
  bots,
  canAddBot,
  canStart,
  launching,
  reason,
  onBegin,
  onStepBots,
}: {
  readonly bots: number;
  readonly canAddBot: boolean;
  readonly canStart: boolean;
  readonly launching: boolean;
  readonly reason: string | undefined;
  readonly onBegin: () => void;
  readonly onStepBots: (delta: 1 | -1) => void;
}) {
  const item = useFocusItem<HTMLButtonElement>('begin', {
    onNavigate: (direction) => {
      if (direction === 'left') onStepBots(-1);
      else if (direction === 'right') onStepBots(1);
      else return false;
      return true;
    },
  });
  return (
    <div className="cs__bar">
      <button
        type="button"
        {...item}
        className="cs__begin"
        aria-label={canStart ? 'Begin' : `Begin: ${reason ?? ''}`}
        aria-disabled={!canStart || launching}
        aria-describedby="cs-bots"
        onClick={() => {
          if (canStart && !launching) onBegin();
        }}
      >
        {canStart ? (
          <>
            PRESS <SelectGlyph /> TO BEGIN
          </>
        ) : (
          <span className="cs__begin-why">{reason}</span>
        )}
      </button>
      <span className="cs__bots" id="cs-bots">
        <button
          type="button"
          className="cs__step"
          tabIndex={-1}
          aria-label="One bot fewer"
          disabled={bots === 0}
          onClick={() => onStepBots(-1)}
        >
          ‹
        </button>
        <span data-testid="bots">{botsLabel(bots)}</span>
        <button
          type="button"
          className="cs__step"
          tabIndex={-1}
          aria-label="One bot more"
          disabled={!canAddBot}
          onClick={() => onStepBots(1)}
        >
          ›
        </button>
      </span>
    </div>
  );
}

function Tile({ tile }: { readonly tile: SelectTileView }) {
  const ready = tile.cursors.find((c) => c.ready);
  const lead = ready ?? tile.cursors[0];
  const style = {
    '--cursor': lead?.color ?? 'transparent',
    '--tint': ready !== undefined ? tile.character.tint : undefined,
  } as CSSProperties;
  return (
    <div
      className="cs__tile"
      role="gridcell"
      data-soon={tile.character.comingSoon}
      aria-label={`${tile.character.name}${tile.character.comingSoon === true ? ' (coming soon)' : ''}${tile.cursors.length > 0 ? `: ${tile.cursors.map((c) => `P${c.number}${c.ready ? ' ready' : ''}`).join(', ')}` : ''}`}
      data-cursor={lead !== undefined ? (ready !== undefined ? 'ready' : 'hover') : undefined}
      style={style}
    >
      {tile.character.comingSoon === true ? (
        <ComingSoon />
      ) : (
        <img
          className="cs__thumb"
          src={tile.character.motion?.still ?? tile.character.portrait}
          alt=""
          draggable={false}
        />
      )}
      {tile.cursors.length > 0 && (
        <span className="cs__tags" aria-hidden="true">
          {tile.cursors.map((c) => (
            <span
              key={c.number}
              className="cs__badge cs__badge--tile"
              style={{ '--badge': c.color } as CSSProperties}
            >
              P{c.number}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
