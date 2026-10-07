import type { ControllerManifest, SystemAction } from '@foomerang/protocol';
import type { ControllerState, Point } from '@foomerang/controller-sdk';
import type { SessionPort } from '../../src/session';

export const MOVE_MANIFEST: ControllerManifest = {
  gameId: 'foomerang-fu',
  orientation: 'landscape',
  controls: [{ id: 'MOVE', type: 'joystick' }],
};

export const FU_MANIFEST: ControllerManifest = {
  gameId: 'foomerang-fu',
  orientation: 'landscape',
  controls: [
    { id: 'MOVE', type: 'joystick' },
    { id: 'SLASH', type: 'button', action: 'PRIMARY' },
    { id: 'THROW', type: 'button', action: 'SECONDARY' },
  ],
};

export const IDLE: ControllerState = {
  phase: 'IDLE',
  joinCode: undefined,
  displayName: undefined,
  playerId: undefined,
  manifest: undefined,
  context: undefined,
  failure: undefined,
};

export const READY: ControllerState = {
  phase: 'READY',
  joinCode: 'K7M4PX',
  displayName: 'Alice',
  playerId: 'player-1',
  manifest: MOVE_MANIFEST,
  context: undefined,
  failure: undefined,
};

/** A stand-in for the SDK session that records what the UI asks of it. */
export class FakeSession implements SessionPort {
  state: ControllerState;
  readonly calls: { method: string; args: unknown[] }[] = [];
  readonly #listeners = new Set<() => void>();

  constructor(state: ControllerState = IDLE) {
    this.state = state;
  }

  getState = (): ControllerState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  };

  set(next: Partial<ControllerState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of [...this.#listeners]) listener();
  }

  join = (joinCode: string, displayName: string): void =>
    void this.calls.push({ method: 'join', args: [joinCode, displayName] });
  leave = (): void => void this.calls.push({ method: 'leave', args: [] });
  neutralize = (): void => void this.calls.push({ method: 'neutralize', args: [] });
  setButton = (id: string, pressed: boolean): void =>
    void this.calls.push({ method: 'setButton', args: [id, pressed] });
  setSystemButton = (action: SystemAction, pressed: boolean): void =>
    void this.calls.push({ method: 'setSystemButton', args: [action, pressed] });
  setControlValue = (id: string, value: Point): void =>
    void this.calls.push({ method: 'setControlValue', args: [id, value] });

  called(method: string): { method: string; args: unknown[] }[] {
    return this.calls.filter((call) => call.method === method);
  }
}
