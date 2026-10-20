import { buildJoinUrl } from '../../config';
import type { HostState } from '../../host';
import { MAX_PARTICIPANTS, type CpuEntry } from '../../runtime/cpuRoster';
import { SELECT_GRID, type Pick } from '../../runtime/characterSelect';
import { SLOT_STYLES } from '../../runtime/slots';
import { noticeCopy } from '../../ui/copy';
import { CHARACTER_BY_SEAT } from '../components/Characters';
import type { PlayerStatus } from '../components/PlayerTile';
import {
  EMPTY_ROOM,
  type CharacterSelectView,
  type RoomPhase,
  type SeatView,
  type SelectSeatView,
  type ShellModel,
  type ShellRoom,
} from '../model';
import { characterView } from '../../characters/videoPalette';
import { addressAdvice, failureView } from './copy';

export type StartBlock = 'MODE_UNAVAILABLE' | 'TOO_FEW' | 'TOO_MANY' | 'NOT_READY' | undefined;

export interface AdapterInput {
  readonly state: HostState;
  readonly cpus: readonly CpuEntry[];
  readonly slotOf: (id: string) => number | undefined;
  readonly startBlock: StartBlock;
  /** Character select (Foomerang Fu): every participant's character and READY. */
  readonly picks?: ReadonlyMap<string, Pick>;
  /** The game PLAY opens. */
  readonly gameId: string;
  readonly controllerBaseUrl: string;
  readonly warnings: readonly string[];
  readonly version: string;
  readonly build: string;
}

const DIFFICULTY_LABEL = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' } as const;
const STATUS: Record<string, PlayerStatus> = {
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  DISCONNECTED: 'away',
};

const ROOM_PHASE: Record<HostState['phase'], RoomPhase> = {
  IDLE: 'none',
  CONNECTING: 'opening',
  CREATING: 'opening',
  ACTIVE: 'open',
  RECONNECTING: 'reconnecting',
  ENDED: 'closed',
};

const shortAddress = (base: string): string => {
  try {
    return new URL(base).host;
  } catch {
    return base;
  }
};

/** The lobby's seats as character select draws them: each with their character and READY, and the grid with every cursor. */
function characterSelect(
  seats: readonly SeatView[],
  picks: ReadonlyMap<string, Pick>,
  bots: number,
  participants: number,
): CharacterSelectView {
  const selectSeats = seats.map((seat): SelectSeatView => {
    const pick = seat.id === undefined ? undefined : picks.get(seat.id);
    return {
      slot: seat.slot,
      number: seat.number,
      kind: seat.kind,
      ...(seat.id !== undefined ? { id: seat.id } : {}),
      ...(seat.name !== undefined ? { name: seat.name } : {}),
      ...(seat.status !== undefined ? { status: seat.status } : {}),
      ...(seat.detail !== undefined ? { detail: seat.detail } : {}),
      ...(pick !== undefined ? { character: characterView(pick.character) } : {}),
      ready: pick?.ready ?? false,
    };
  });
  const grid = SELECT_GRID.map((row) =>
    row.map((id) => ({
      character: characterView(id),
      cursors: selectSeats.flatMap((seat) =>
        seat.character?.id === id
          ? [{ number: seat.number, color: seat.character.color, ready: seat.ready }]
          : [],
      ),
    })),
  );
  return {
    seats: selectSeats,
    grid,
    everyoneReady: selectSeats.every((seat) => seat.kind !== 'phone' || seat.ready),
    bots,
    canAddBot: participants < MAX_PARTICIPANTS,
  };
}

/**
 * session state → what the shell shows. Pure, so every real-state transition can be tested with
 * plain values. The only place besides the hook where the shell meets the host.
 */
export function buildShellModel(input: AdapterInput): ShellModel {
  const { state, cpus } = input;
  const phase = ROOM_PHASE[state.phase];
  const isFu = (state.gameId ?? input.gameId) === 'foomerang-fu';
  const held = state.roster.filter((entry) => entry.seat === 'HELD');

  const blank = (slot: number): SeatView => {
    const style = SLOT_STYLES[slot] as (typeof SLOT_STYLES)[number];
    return { slot, color: style.color, number: style.number, marker: style.marker, kind: 'empty' };
  };
  const seats: SeatView[] = Array.from({ length: SLOT_STYLES.length }, (_, slot) => blank(slot));
  const waitingForSeat: string[] = [];
  for (const entry of held) {
    const slot = input.slotOf(entry.playerId);
    if (slot === undefined || slot >= seats.length) {
      waitingForSeat.push(entry.displayName);
      continue;
    }
    seats[slot] = {
      ...blank(slot),
      kind: 'phone',
      id: entry.playerId,
      name: entry.displayName,
      character: CHARACTER_BY_SEAT[slot] as never,
      status: STATUS[entry.connection] ?? 'away',
    };
  }
  for (const cpu of cpus) {
    const slot = input.slotOf(cpu.id);
    if (slot === undefined || slot >= seats.length) continue;
    seats[slot] = {
      ...blank(slot),
      kind: 'cpu',
      id: cpu.id,
      name: cpu.name,
      character: CHARACTER_BY_SEAT[slot] as never,
      status: 'connected',
      detail: DIFFICULTY_LABEL[cpu.difficulty],
    };
  }

  const participants = held.length + cpus.length;
  const live = state.phase === 'ACTIVE';
  const block = isFu ? input.startBlock : undefined;
  const launching = state.roomState === 'STARTING';
  const canStart = live && block === undefined && !launching;
  let startBlockedReason: string | undefined;
  if (!canStart) {
    startBlockedReason =
      state.phase === 'RECONNECTING'
        ? 'Reconnecting… START is back as soon as the connection is.'
        : block === 'TOO_FEW'
          ? 'At least 2 players are needed. Invite a friend or add a CPU.'
          : block === 'NOT_READY'
            ? 'Everyone must be READY on a character.'
            : block === 'TOO_MANY'
              ? `A match holds at most ${MAX_PARTICIPANTS} players. Remove a CPU.`
              : block === 'MODE_UNAVAILABLE'
                ? 'This game mode is not available yet.'
                : launching
                  ? 'Starting…'
                  : 'Getting your room ready…';
  }

  const hasRoom = phase === 'open' || phase === 'reconnecting' || phase === 'opening';
  const room: ShellRoom = hasRoom
    ? {
        phase,
        code: state.joinCode,
        joinUrl:
          state.joinCode === undefined
            ? undefined
            : buildJoinUrl(input.controllerBaseUrl, state.joinCode),
        shortAddress: shortAddress(input.controllerBaseUrl),
        seats,
        waitingForSeat,
        participants,
        phones: held.length,
        canStart,
        startBlockedReason,
        launching,
        canAddCpu: isFu && live && participants < MAX_PARTICIPANTS,
        notice: state.notice === undefined ? undefined : noticeCopy(state.notice),
        interrupted: state.matchInterrupted,
        select: isFu
          ? characterSelect(seats, input.picks ?? new Map(), cpus.length, participants)
          : undefined,
      }
    : { ...EMPTY_ROOM, phase };

  const failure =
    state.failure !== undefined && (state.phase === 'IDLE' || state.phase === 'ENDED')
      ? failureView(state.failure, state.phase)
      : undefined;

  return {
    gameId: input.gameId,
    room,
    failure,
    warnings: input.warnings.map((w) => addressAdvice(w).bar),
    facts: {
      addressNote:
        input.warnings[0] === undefined ? undefined : addressAdvice(input.warnings[0]).note,
      connection:
        state.phase === 'ACTIVE'
          ? 'Good'
          : state.phase === 'RECONNECTING'
            ? 'Reconnecting…'
            : state.phase === 'IDLE' || state.phase === 'ENDED'
              ? 'Connects when you play'
              : 'Connecting…',
      phoneAddress: shortAddress(input.controllerBaseUrl),
      version: input.version,
      build: input.build,
    },
  };
}
