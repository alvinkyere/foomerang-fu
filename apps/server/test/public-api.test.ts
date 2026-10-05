import { describe, expect, it } from 'vitest';
import * as api from '../src/index';

describe('public API surface', () => {
  // Guards against accidental exports and removals; changing this list is a conscious act.
  it('exports exactly the intended runtime values', () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        'DEFAULT_RATE_LIMITS',
        'createFoomerangServer',
        'createNodeEnvironment',
        'realScheduler',
      ].sort(),
    );
  });

  it('keeps the session layer and the Socket.IO adapter internal', () => {
    // Socket.IO must not leak through the package surface: transports are replaceable.
    for (const internal of [
      'Gateway',
      'Application',
      'Session',
      'BindingTable',
      'SocketIOTransport',
      'TokenBucket',
      'BoundedEventWindow',
      'Diagnostics',
    ]) {
      expect(api, internal).not.toHaveProperty(internal);
    }
  });
});
