/**
 * What survives a console reload so the host can reclaim its room: the join code, the (rotating)
 * host credential, and which game the room is (the server does not repeat that in roster updates). The credential is a secret; it lives only here, in per-tab storage.
 */
export interface StoredHost {
  readonly joinCode: string;
  readonly hostToken: string;
  readonly gameId: string;
}

export interface HostStore {
  load(): StoredHost | undefined;
  save(host: StoredHost): void;
  clear(): void;
}

const KEY = 'foomerang.console.host';
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** Storage can be missing, throw, or hold junk; none of that may break the console. */
export function createHostStore(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined,
): HostStore {
  return {
    load() {
      try {
        const raw = storage?.getItem(KEY);
        if (raw === null || raw === undefined) return undefined;
        const value = JSON.parse(raw) as Record<string, unknown> | null;
        if (typeof value !== 'object' || value === null) return undefined;
        const { joinCode, hostToken, gameId } = value;
        if (!nonEmpty(joinCode) || !nonEmpty(hostToken) || !nonEmpty(gameId)) return undefined;
        return { joinCode, hostToken, gameId };
      } catch {
        return undefined;
      }
    },
    save(host) {
      try {
        storage?.setItem(
          KEY,
          JSON.stringify({
            joinCode: host.joinCode,
            hostToken: host.hostToken,
            gameId: host.gameId,
          }),
        );
      } catch {
        // Not being able to persist must never break hosting.
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
