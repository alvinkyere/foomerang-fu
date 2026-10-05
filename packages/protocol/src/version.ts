/**
 * Wire-protocol version. Bumped ONLY for breaking wire changes — never for application releases
 * (see `clientVersion` in client.ts).
 */
export const PROTOCOL_VERSION = 1;

/** Versions this build can speak. Grows when we deliberately support older clients. */
const SUPPORTED_PROTOCOL_VERSIONS: readonly number[] = [PROTOCOL_VERSION];

export function isSupportedProtocolVersion(value: unknown): value is number {
  return typeof value === 'number' && SUPPORTED_PROTOCOL_VERSIONS.includes(value);
}
