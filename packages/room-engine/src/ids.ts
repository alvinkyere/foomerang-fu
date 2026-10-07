import { joinCodeSchema } from '@foomerang/protocol';

/**
 * Opaque identity types: plain strings at runtime (they serialize naturally) but not
 * interchangeable in the type system, so `reconnect(playerId, roomId)` does not compile.
 */
declare const brand: unique symbol;
type Brand<TName extends string> = string & { readonly [brand]: TName };

/** Machine identity of a room. Never user-facing. */
export type RoomId = Brand<'RoomId'>;
export type PlayerId = Brand<'PlayerId'>;
export type HostId = Brand<'HostId'>;
/** Temporary human discovery code for a room; distinct from RoomId. */
export type JoinCode = Brand<'JoinCode'>;

/** Machine identity of a console session (one Foomerang on one TV). Never user-facing. */
export type ConsoleId = Brand<'ConsoleId'>;
/** A phone's membership of a console session. Survives games and Home; never a game seat. */
export type ControllerId = Brand<'ControllerId'>;
/** One launch of one game on a console. Messages aimed at an exited launch are stale. */
export type GameSessionId = Brand<'GameSessionId'>;

export const toRoomId = (value: string): RoomId => value as RoomId;
export const toConsoleId = (value: string): ConsoleId => value as ConsoleId;
export const toControllerId = (value: string): ControllerId => value as ControllerId;
export const toGameSessionId = (value: string): GameSessionId => value as GameSessionId;
export const toPlayerId = (value: string): PlayerId => value as PlayerId;
export const toHostId = (value: string): HostId => value as HostId;

/**
 * Brands a join code that has already been validated by the protocol's schema (the single
 * definition of what a valid code looks like). Case-insensitive; yields the canonical form.
 */
export function parseJoinCode(input: string): JoinCode | undefined {
  const result = joinCodeSchema.safeParse(input);
  return result.success ? (result.data as JoinCode) : undefined;
}
