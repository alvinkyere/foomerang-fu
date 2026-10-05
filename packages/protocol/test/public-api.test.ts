import { describe, expect, it } from 'vitest';
import * as api from '../src/index';

describe('public API surface', () => {
  // Guards against accidental exports (and accidental removals). Changing this list is a
  // conscious, reviewable act.
  it('exports exactly the intended runtime values', () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        'ACTIONS',
        'ACTION_PHASES',
        'CLIENT_TYPES',
        'ERROR_CODES',
        'JOIN_CODE_ALPHABET',
        'JOIN_CODE_LENGTH',
        'PROTOCOL_VERSION',
        'SEQ_MAX',
        'axisSchema',
        'clientTypeSchema',
        'clientVersionSchema',
        'errorCodeSchema',
        'errorMessageSchema',
        'eventIdSchema',
        'handshakeMessageSchema',
        'handshakePayloadSchema',
        'heartbeatAckMessageSchema',
        'heartbeatMessageSchema',
        'inputEventMessageSchema',
        'inputMoveMessageSchema',
        'isSupportedProtocolVersion',
        'joinCodeSchema',
        'parseClientMessage',
        'parseServerMessage',
        'seqSchema',
      ].sort(),
    );
  });

  it('does not export envelope builders (internal)', () => {
    expect(api).not.toHaveProperty('plainEnvelope');
    expect(api).not.toHaveProperty('stateEnvelope');
    expect(api).not.toHaveProperty('eventEnvelope');
  });
});
