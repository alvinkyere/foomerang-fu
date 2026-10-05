/**
 * What survives a page reload so a player can look back up at the TV and keep playing: the room,
 * the name, the player identity and the (rotating) reconnect credential. The credential is a
 * secret; it is kept only here, in per-tab storage, and nowhere else.
 */
export interface StoredSession {
  readonly joinCode: string;
  readonly displayName: string;
  readonly playerId: string;
  readonly reconnectToken: string;
}

export interface SessionStore {
  load(): StoredSession | undefined;
  save(session: StoredSession): void;
  clear(): void;
}

const KEY = 'foomerang.controller.session';

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/**
 * Backed by a Storage (pass `sessionStorage`: per tab, cleared when the tab closes). Storage can
 * be missing or throw (private mode, blocked site data), and its contents can be corrupt or from
 * another version: none of that may ever break the controller.
 */
export function createStorageSessionStore(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined,
): SessionStore {
  return {
    load() {
      try {
        const raw = storage?.getItem(KEY);
        if (raw === null || raw === undefined) return undefined;
        const value = JSON.parse(raw) as Record<string, unknown> | null;
        if (typeof value !== 'object' || value === null) return undefined;
        const { joinCode, displayName, playerId, reconnectToken } = value;
        if (![joinCode, displayName, playerId, reconnectToken].every(nonEmpty)) return undefined;
        return { joinCode, displayName, playerId, reconnectToken } as StoredSession;
      } catch {
        return undefined;
      }
    },
    save(session) {
      try {
        const { joinCode, displayName, playerId, reconnectToken } = session;
        storage?.setItem(KEY, JSON.stringify({ joinCode, displayName, playerId, reconnectToken }));
      } catch {
        // Not being able to persist must never break playing.
      }
    },
    clear() {
      try {
        storage?.removeItem(KEY);
      } catch {
        // see above
      }
    },
  };
}
