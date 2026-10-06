/**
 * What survives a console reload so the host can reclaim its room: the join code and the (rotating)
 * host credential. The credential is a secret; it lives only here, in per-tab storage.
 */
export interface StoredHost {
  readonly joinCode: string;
  readonly hostToken: string;
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
        const { joinCode, hostToken } = value;
        if (!nonEmpty(joinCode) || !nonEmpty(hostToken)) return undefined;
        return { joinCode, hostToken };
      } catch {
        return undefined;
      }
    },
    save(host) {
      try {
        storage?.setItem(
          KEY,
          JSON.stringify({ joinCode: host.joinCode, hostToken: host.hostToken }),
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
