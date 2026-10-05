import { joinCodeSchema } from '@foomerang/protocol';

/** The room code carried by the QR link (`?room=K7M4PX`), or nothing if absent or invalid. */
export function parseRoomParam(search: string): string | undefined {
  const raw = new URLSearchParams(search).get('room');
  if (raw === null) return undefined;
  const parsed = joinCodeSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export const DEFAULT_SERVER_PORT = 3001;

export interface ServerUrlInputs {
  readonly search: string;
  readonly protocol: string;
  readonly hostname: string;
  /** A build-time URL (`VITE_SERVER_URL`), if configured. */
  readonly envUrl: string | undefined;
  /** Only development builds honour `?server=`: a link must not be able to repoint a production controller. */
  readonly allowOverride: boolean;
}

function httpOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.host !== ''
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Where the server is. Default: port 3001 on the machine that served this page — which is exactly
 * right for a phone loading the controller from a dev laptop over the LAN.
 */
export function resolveServerUrl(inputs: ServerUrlInputs): string {
  if (inputs.allowOverride) {
    const override = new URLSearchParams(inputs.search).get('server');
    const origin = override === null ? undefined : httpOrigin(override);
    if (origin !== undefined) return origin;
  }
  if (inputs.envUrl !== undefined && inputs.envUrl !== '') {
    return httpOrigin(inputs.envUrl) ?? inputs.envUrl.replace(/\/+$/, '');
  }
  return `${inputs.protocol}//${inputs.hostname}:${DEFAULT_SERVER_PORT}`;
}
