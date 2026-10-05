/**
 * Room lifecycle. Explicit states and an explicit transition table — no boolean flags, and no
 * code anywhere assigns `room.state` directly (see room.ts). `CREATING` is intentionally absent:
 * room creation is atomic, so a half-created room is never observable.
 *
 *   LOBBY → STARTING → PLAYING → RESULTS → LOBBY
 *   any live state → CLOSING → CLOSED   (CLOSED is terminal)
 */
export const ROOM_STATES = [
  'LOBBY',
  'STARTING',
  'PLAYING',
  'RESULTS',
  'CLOSING',
  'CLOSED',
] as const;

export type RoomState = (typeof ROOM_STATES)[number];

export const ROOM_TRANSITIONS: Readonly<Record<RoomState, readonly RoomState[]>> = {
  LOBBY: ['STARTING', 'CLOSING'],
  STARTING: ['PLAYING', 'CLOSING'],
  PLAYING: ['RESULTS', 'CLOSING'],
  RESULTS: ['LOBBY', 'CLOSING'],
  CLOSING: ['CLOSED'],
  CLOSED: [],
};

export function canTransition(from: RoomState, to: RoomState): boolean {
  return ROOM_TRANSITIONS[from].includes(to);
}
