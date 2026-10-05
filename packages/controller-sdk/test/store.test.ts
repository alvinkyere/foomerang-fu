import { describe, expect, it } from 'vitest';
import { createStorageSessionStore, type StoredSession } from '../src/store';

const stored: StoredSession = {
  joinCode: 'K7M4PX',
  displayName: 'Alice',
  playerId: 'player-1',
  reconnectToken: 'tok',
};

class FakeStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  readonly data = new Map<string, string>();
  getItem = (key: string) => this.data.get(key) ?? null;
  setItem = (key: string, value: string) => void this.data.set(key, value);
  removeItem = (key: string) => void this.data.delete(key);
}

describe('storage-backed session store', () => {
  it('round-trips a session', () => {
    const store = createStorageSessionStore(new FakeStorage());
    expect(store.load()).toBeUndefined();
    store.save(stored);
    expect(store.load()).toEqual(stored);
    store.clear();
    expect(store.load()).toBeUndefined();
  });

  it.each([
    'not json',
    '{}',
    '[]',
    'null',
    '{"joinCode":1}',
    JSON.stringify({ ...stored, reconnectToken: '' }),
  ])('treats corrupt or foreign data (%s) as “nothing stored”', (value) => {
    const storage = new FakeStorage();
    storage.setItem('foomerang.controller.session', value);
    expect(createStorageSessionStore(storage).load()).toBeUndefined();
  });

  it('storage that throws (private mode, blocked site data) never breaks the controller', () => {
    const hostile = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const store = createStorageSessionStore(hostile);
    expect(() => store.save(stored)).not.toThrow();
    expect(store.load()).toBeUndefined();
    expect(() => store.clear()).not.toThrow();
  });

  it('works with no storage at all', () => {
    const store = createStorageSessionStore(undefined);
    expect(() => store.save(stored)).not.toThrow();
    expect(store.load()).toBeUndefined();
  });

  it('never stores more than the fields it needs', () => {
    const storage = new FakeStorage();
    createStorageSessionStore(storage).save({ ...stored, extra: 'secret' } as StoredSession);
    expect(storage.data.size).toBe(1); // one key, nothing alongside it
    expect(
      Object.keys(
        JSON.parse(storage.getItem('foomerang.controller.session') ?? '{}') as object,
      ).sort(),
    ).toEqual(['displayName', 'joinCode', 'playerId', 'reconnectToken']);
  });
});
