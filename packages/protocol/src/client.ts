import { z } from 'zod';
import { plainEnvelope } from './envelope';

export const CLIENT_TYPES = ['console', 'controller', 'native-controller'] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];
export const clientTypeSchema = z.enum(CLIENT_TYPES);

/**
 * Application release version (semver). Purely informational: releasing app 0.2.0 does NOT imply
 * a wire-protocol change. Compatibility is decided solely by `protocolVersion`.
 */
export const clientVersionSchema = z
  .string()
  .max(32)
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);

/**
 * Shape-valid for ANY positive integer protocolVersion, so a future client's handshake can be
 * answered with UNSUPPORTED_PROTOCOL instead of an unhelpful INVALID_MESSAGE. Whether the version
 * is supported is decided in parse.ts via isSupportedProtocolVersion.
 */
export const handshakePayloadSchema = z.strictObject({
  protocolVersion: z.number().int().min(1),
  clientType: clientTypeSchema,
  clientVersion: clientVersionSchema,
});
export type HandshakePayload = z.infer<typeof handshakePayloadSchema>;

export const handshakeMessageSchema = plainEnvelope('HANDSHAKE', handshakePayloadSchema);
export type HandshakeMessage = z.infer<typeof handshakeMessageSchema>;

/** Server → client: the handshake was accepted and this connection is now ACTIVE. */
export const handshakeAcceptedMessageSchema = plainEnvelope(
  'HANDSHAKE_ACCEPTED',
  z.strictObject({ protocolVersion: z.number().int().min(1) }),
);
export type HandshakeAcceptedMessage = z.infer<typeof handshakeAcceptedMessageSchema>;
