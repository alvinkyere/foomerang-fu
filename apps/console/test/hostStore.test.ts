import { describe, expect, it } from 'vitest';
import { createHostStore } from '../src/host';

class MemoryStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

const host = { joinCode: 'K7M4PX', hostToken: 'secret-token', gameId: 'foomerang-fu' };

describe('host store (what survives a console reload)', () => {
  it('round-trips the room and credential', () => {
    const store = createHostStore(new MemoryStorage());
    expect(store.load()).toBeUndefined();
    store.save(host);
    expect(store.load()).toEqual(host);
  });

  it('forgets on clear()', () => {
    const store = createHostStore(new MemoryStorage());
    store.save(host);
    store.clear();
    expect(store.load()).toBeUndefined();
  });

  it('stores exactly the three fields, nothing else', () => {
    const storage = new MemoryStorage();
    createHostStore(storage).save({ ...host, extra: 'x' } as typeof host);
    expect(JSON.parse([...storage.items.values()][0] ?? '{}')).toEqual(host);
  });

  it.each([
    ['not json', 'not json'],
    ['null', 'null'],
    ['a string', '"x"'],
    ['missing token', '{"joinCode":"K7M4PX","gameId":"foomerang-fu"}'],
    ['empty token', '{"joinCode":"K7M4PX","hostToken":"","gameId":"foomerang-fu"}'],
    ['empty code', '{"joinCode":"","hostToken":"t","gameId":"foomerang-fu"}'],
    ['missing game (an older record)', '{"joinCode":"K7M4PX","hostToken":"t"}'],
    ['empty game', '{"joinCode":"K7M4PX","hostToken":"t","gameId":""}'],
    ['wrong types', '{"joinCode":1,"hostToken":2}'],
  ])('treats corrupt storage (%s) as nothing stored', (_name, raw) => {
    const storage = new MemoryStorage();
    storage.setItem('foomerang.console.host', raw);
    expect(createHostStore(storage).load()).toBeUndefined();
  });

  it('never throws, whatever the storage does', () => {
    const throwing = {
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
    const store = createHostStore(throwing);
    expect(() => store.save(host)).not.toThrow();
    expect(() => store.clear()).not.toThrow();
    expect(store.load()).toBeUndefined();
    const none = createHostStore(undefined);
    none.save(host);
    expect(none.load()).toBeUndefined();
  });
});
