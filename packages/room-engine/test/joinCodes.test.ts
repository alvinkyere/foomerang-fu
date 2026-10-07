import { describe, expect, it } from 'vitest';
import { ConsoleRegistry } from '../src/consoleRegistry';
import { JoinCodeSpace } from '../src/joinCodes';
import { RoomRegistry } from '../src/registry';
import { createFakeConsoleEnvironment } from './support/fakeConsoleEnvironment';
import { codeFor, createFakeEnvironment } from './support/fakeEnvironment';
import { FOOMERANG_FU } from './support/rooms';

describe('one join-code space while legacy rooms and console sessions coexist', () => {
  it('a code held by a legacy room is never given to a console session, and vice versa', () => {
    const codes = new JoinCodeSpace();
    const roomEnv = createFakeEnvironment({ joinCodes: [codeFor(1), codeFor(3)] });
    const consoleEnv = createFakeConsoleEnvironment();
    consoleEnv.joinCodes = [codeFor(1), codeFor(2), codeFor(3), codeFor(4)];
    const rooms = new RoomRegistry(roomEnv, { joinCodes: codes, maxJoinCodeAttempts: 1 });
    const consoles = new ConsoleRegistry(consoleEnv, { joinCodes: codes });

    const room = rooms.createRoom(FOOMERANG_FU);
    if (!room.ok) throw new Error('setup');
    expect(room.value.joinCode).toBe(codeFor(1));

    const first = consoles.open();
    if (!first.ok) throw new Error('setup');
    expect(first.value.joinCode).toBe(codeFor(2)); // codeFor(1) is the room's

    const second = consoles.open();
    if (!second.ok) throw new Error('setup');
    expect(second.value.joinCode).toBe(codeFor(3));
    expect(rooms.createRoom(FOOMERANG_FU)).toEqual({ ok: false, reason: 'JOIN_CODE_EXHAUSTED' });
  });

  it('closing a console session gives its code back to the shared space', () => {
    const codes = new JoinCodeSpace();
    const env = createFakeConsoleEnvironment();
    env.joinCodes = [codeFor(7), codeFor(7)];
    const consoles = new ConsoleRegistry(env, { joinCodes: codes });
    const opened = consoles.open();
    if (!opened.ok) throw new Error('setup');
    consoles.beginClose(opened.value.consoleId);
    consoles.completeClose(opened.value.consoleId);
    expect(codes.has(opened.value.joinCode)).toBe(false);
    const again = consoles.open();
    expect(again.ok && again.value.joinCode).toBe(codeFor(7));
  });

  it('each registry still works alone (its own space by default)', () => {
    const rooms = new RoomRegistry(createFakeEnvironment());
    const consoles = new ConsoleRegistry(createFakeConsoleEnvironment());
    expect(rooms.createRoom(FOOMERANG_FU).ok).toBe(true);
    expect(consoles.open().ok).toBe(true);
  });
});
