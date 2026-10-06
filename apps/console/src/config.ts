import { joinCodeSchema } from '@foomerang/protocol';

export interface PageLocation {
  readonly protocol: string;
  readonly hostname: string;
}

export interface ConsoleConfigInput extends PageLocation {
  /** FOOMERANG_CONTROLLER_URL: where a PHONE can reach the controller app. */
  readonly controllerUrl: string | undefined;
  /** FOOMERANG_SERVER_URL: where THIS browser reaches the game server. */
  readonly serverUrl: string | undefined;
}

export type ConsoleConfig =
  | {
      readonly ok: true;
      readonly controllerBaseUrl: string;
      readonly serverUrl: string;
      readonly warnings: readonly string[];
    }
  | { readonly ok: false; readonly problems: readonly string[] };

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0']);

/** Validates one configured URL; returns the normalized form (no trailing slash) or a reason. */
function validateUrl(
  name: string,
  raw: string,
  allowPath: boolean,
): { url: string } | { problem: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { problem: `${name} (${JSON.stringify(raw)}) is not a valid URL` };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { problem: `${name} must use http or https (got ${parsed.protocol})` };
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return { problem: `${name} must not contain credentials` };
  }
  if (parsed.search !== '') return { problem: `${name} must not contain a query string` };
  if (parsed.hash !== '') return { problem: `${name} must not contain a fragment` };
  const path = parsed.pathname.replace(/\/+$/, '');
  if (!allowPath && path !== '') return { problem: `${name} must not contain a path` };
  return { url: `${parsed.origin}${path}` };
}

/**
 * Resolves the console's two addresses. Nothing is inferred from network interfaces: the
 * controller URL is either given explicitly or defaults to the machine that served this page —
 * which is only useful to a phone if that is a LAN-reachable name, so loopback defaults warn.
 */
export function resolveConsoleConfig(input: ConsoleConfigInput): ConsoleConfig {
  const problems: string[] = [];
  const warnings: string[] = [];
  const host =
    input.hostname.includes(':') && !input.hostname.startsWith('[')
      ? `[${input.hostname}]`
      : input.hostname;

  let controllerBaseUrl = `${input.protocol}//${host}:5173`;
  const explicitController = input.controllerUrl !== undefined && input.controllerUrl !== '';
  if (explicitController) {
    const result = validateUrl('FOOMERANG_CONTROLLER_URL', input.controllerUrl ?? '', true);
    if ('problem' in result) problems.push(result.problem);
    else controllerBaseUrl = result.url;
  }

  let serverUrl = `${input.protocol}//${host}:3001`;
  if (input.serverUrl !== undefined && input.serverUrl !== '') {
    const result = validateUrl('FOOMERANG_SERVER_URL', input.serverUrl, false);
    if ('problem' in result) problems.push(result.problem);
    else serverUrl = result.url;
  }

  if (problems.length > 0) return { ok: false, problems };

  if (
    LOOPBACK.has(new URL(controllerBaseUrl).hostname) ||
    LOOPBACK.has(new URL(controllerBaseUrl).host)
  ) {
    warnings.push(
      'The controller URL points at this computer (localhost), so a phone scanning the QR code cannot reach it. ' +
        'Set FOOMERANG_CONTROLLER_URL to an address the phone can reach, e.g. http://192.168.1.20:5173.',
    );
  }
  return { ok: true, controllerBaseUrl, serverUrl, warnings };
}

/**
 * The link a QR code carries: the controller app and the room code — NOTHING else. Scanning the
 * QR identifies a room; it does not authenticate a player. No token, credential or identity ever
 * goes in this URL.
 */
export function buildJoinUrl(controllerBaseUrl: string, roomCode: string): string {
  if (roomCode !== roomCode.toUpperCase() || !joinCodeSchema.safeParse(roomCode).success) {
    throw new RangeError('not a valid room code');
  }
  const url = new URL(`${controllerBaseUrl.replace(/\/+$/, '')}/`);
  url.searchParams.set('room', roomCode);
  return url.toString();
}
