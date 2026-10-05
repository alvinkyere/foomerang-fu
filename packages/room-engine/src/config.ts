/**
 * Per-room configuration, supplied by the game being hosted. Capacity is configuration — the
 * generic engine enforces it but never decides it (Foomerang Fu is 2–6; another game may be 4–12).
 */
export interface RoomConfig {
  readonly gameId: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
}

const GAME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Returns a frozen copy, or `undefined` if the configuration is invalid. */
export function validateRoomConfig(input: RoomConfig): RoomConfig | undefined {
  const { gameId, minPlayers, maxPlayers } = input;
  if (typeof gameId !== 'string' || !GAME_ID_PATTERN.test(gameId)) return undefined;
  if (!Number.isSafeInteger(minPlayers) || !Number.isSafeInteger(maxPlayers)) return undefined;
  if (minPlayers < 1 || maxPlayers < minPlayers) return undefined;
  return Object.freeze({ gameId, minPlayers, maxPlayers });
}
