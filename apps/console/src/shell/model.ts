import type { CharacterId } from './components/Characters';
import type { PlayerStatus } from './components/PlayerTile';

/*
 * The shell's view model: the ONLY thing the shell's screens know about the outside world.
 * `adapter/` builds it from the real session; `harness/` builds it from fixtures. Nothing in here
 * (or in components/ and screens/) imports the session, the runtime or any transport.
 */

export interface SeatView {
  readonly slot: number;
  readonly color: string;
  readonly number: number;
  readonly marker: string;
  readonly kind: 'phone' | 'cpu' | 'empty';
  readonly id?: string;
  readonly name?: string;
  readonly character?: CharacterId;
  readonly status?: PlayerStatus;
  /** CPU difficulty, shown and stepped with ←/→. */
  readonly detail?: string;
}

/** A character as character select shows it. */
export interface CharacterView {
  readonly id: string;
  readonly name: string;
  /** Its one colour (its player's badge, cursor and boomerang). */
  readonly color: string;
  /** Its colour, softened: a READY circle and tile are filled with it. */
  readonly tint: string;
  readonly portrait: string;
  /** Its character-select circle animation (game-setting.mp4): the pre-rendered sheet and its first frame alone. */
  readonly motion?: { readonly sheet: string; readonly still: string };
  /** No model yet: shown on the grid, never chosen. */
  readonly comingSoon?: true;
}

/** One of the six circles at the top of character select. */
export interface SelectSeatView {
  readonly slot: number;
  readonly number: number;
  readonly kind: 'phone' | 'cpu' | 'empty';
  readonly id?: string;
  readonly name?: string;
  readonly status?: PlayerStatus;
  /** CPU difficulty, shown and stepped with ←/→. */
  readonly detail?: string;
  /** The character under their cursor (or chosen, once READY). */
  readonly character?: CharacterView;
  readonly ready: boolean;
}

/** A player's cursor on a grid tile: their badge (number, in their character's colour). */
export interface SelectCursorView {
  readonly number: number;
  readonly color: string;
  readonly ready: boolean;
}

export interface SelectTileView {
  readonly character: CharacterView;
  /** Everyone whose cursor is on it, in seat order (a READY player's is their choice). */
  readonly cursors: readonly SelectCursorView[];
}

/** Character select (Foomerang Fu), as in the reference video: who is where, the grid, and the begin bar. */
export interface CharacterSelectView {
  readonly seats: readonly SelectSeatView[];
  readonly grid: readonly (readonly SelectTileView[])[];
  /** No person is still choosing: the begin bar shows. */
  readonly everyoneReady: boolean;
  readonly bots: number;
  readonly canAddBot: boolean;
}

/** 'none': no room. 'opening': asking for one. 'open': ready for phones. 'reconnecting': the room is kept, the line is down. 'closed': it ended. */
export type RoomPhase = 'none' | 'opening' | 'open' | 'reconnecting' | 'closed';
export type JoinStatus = 'loading' | 'ready' | 'reconnecting' | 'error';

export interface ShellFailure {
  readonly title: string;
  readonly message: string;
}

export interface ShellRoom {
  readonly phase: RoomPhase;
  readonly code?: string | undefined;
  /** What a phone is sent to (and the QR encodes). */
  readonly joinUrl?: string | undefined;
  /** The same, short, for people who cannot scan. */
  readonly shortAddress?: string | undefined;
  readonly seats: readonly SeatView[];
  /** People who are in the room but have no seat (the table is full). */
  readonly waitingForSeat: readonly string[];
  readonly participants: number;
  readonly phones: number;
  readonly canStart: boolean;
  /** Plain words for why START is unavailable (only when it is). */
  readonly startBlockedReason?: string | undefined;
  /** True from the moment the server is starting the match. */
  readonly launching: boolean;
  readonly canAddCpu: boolean;
  /** A refusal that did not end anything ("not enough players"), in plain words. Changes → shown once. */
  readonly notice?: string | undefined;
  /** This screen was reloaded and the match it was running is gone. */
  readonly interrupted: boolean;
  /** Foomerang Fu: the room's lobby is character select. */
  readonly select?: CharacterSelectView | undefined;
}

export interface ShellFacts {
  /** Why phones may not be able to reach the address above, in full (shown in Settings › Network). */
  readonly addressNote?: string | undefined;
  readonly connection: string;
  readonly phoneAddress: string;
  readonly version: string;
  readonly build: string;
}

export interface ShellModel {
  readonly gameId: string;
  readonly room: ShellRoom;
  /** Something went wrong that the player must acknowledge (a room that could not open, or closed). */
  readonly failure?: ShellFailure | undefined;
  /** Configuration problems worth showing on Join (e.g. a QR that a phone could never reach). */
  readonly warnings: readonly string[];
  readonly facts: ShellFacts;
}

export interface ShellActions {
  /** PLAY: open a room for the game. Also Retry. */
  openRoom(): void;
  /** Give the room up and go home. */
  closeRoom(): void;
  start(): void;
  addCpu(): void;
  removeCpu(id: string): void;
  stepCpu(id: string, delta: 1 | -1): void;
  /** The begin bar's ‹ BOTS ›: one more bot, or one fewer (the last added). */
  stepBots(delta: 1 | -1): void;
  /** Acknowledge a failure. */
  dismissFailure(): void;
}

export const EMPTY_ROOM: ShellRoom = {
  phase: 'none',
  seats: [],
  waitingForSeat: [],
  participants: 0,
  phones: 0,
  canStart: false,
  launching: false,
  canAddCpu: false,
  interrupted: false,
};
