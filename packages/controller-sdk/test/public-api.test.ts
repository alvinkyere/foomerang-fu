import { describe, expect, it } from 'vitest';
import * as api from '../src/index';

describe('public API surface', () => {
  // Guards against accidental exports and removals; changing this list is a conscious act.
  it('exports exactly the intended runtime values', () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        'ControllerSession',
        'DEFAULT_SAMPLER_CONFIG',
        'MovementSampler',
        'SocketIOTransport',
        'browserEnvironment',
        'clampOrigin',
        'createControllerSession',
        'createSocketIOTransportFactory',
        'createStorageSessionStore',
        'joystickRadius',
        'joystickVector',
      ].sort(),
    );
  });

  it('UI code gets sessions, geometry and transports — never raw protocol plumbing or sockets', () => {
    // Sequence numbers, handshakes and reconnection live inside ControllerSession.
    for (const internal of ['io', 'Socket', 'FINAL_ERRORS', 'IDLE_STATE', 'nextSeq']) {
      expect(api, internal).not.toHaveProperty(internal);
    }
  });
});
