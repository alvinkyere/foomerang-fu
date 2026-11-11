import { createSocketIOTransportFactory } from '@foomerang/controller-sdk';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { music } from './audio/music';
import { loadSound } from './audio/sound';
import { parseGameParam, resolveConsoleConfig } from './config';
import { createConsoleRuntime } from './consoleRuntime';
import {
  productArena,
  parseEnabledParam,
  parseGiveParam,
  parseKillsParam,
  parsePowerupsParam,
} from './runtime/powerupMode';
import { createHostStore } from './host';
import type { ArenaRenderer } from './render/renderer';
import { arenaRendererFor } from './render/loadArenaRenderer';
import { App } from './ui/App';
import { ConfigError } from './ui/ConfigError';
import { ROUND_INTRO } from './render/roundIntro';
import './styles.css';

function sessionStorageOrNothing(): Storage | undefined {
  try {
    return window.sessionStorage; // per tab: cleared when the tab closes
  } catch {
    return undefined; // blocked site data
  }
}

const rootElement = document.getElementById('root');
if (rootElement === null) throw new Error('missing #root');
const root = createRoot(rootElement);

// Both addresses are explicit, validated configuration — never inferred from network interfaces.
// (FOOMERANG_* variables hold URLs and are readable by the page; they must never hold secrets.)
// On standard web ports (e.g. Vercel deployment without port in location), default to same-origin routing.
const defaultControllerUrl =
  window.location.port === '' ? `${window.location.origin}/controller` : undefined;
const defaultServerUrl = window.location.port === '' ? window.location.origin : undefined;

const config = resolveConsoleConfig({
  protocol: window.location.protocol,
  hostname: window.location.hostname,
  controllerUrl:
    (import.meta.env['FOOMERANG_CONTROLLER_URL'] as string | undefined) ?? defaultControllerUrl,
  serverUrl: (import.meta.env['FOOMERANG_SERVER_URL'] as string | undefined) ?? defaultServerUrl,
});

if (!config.ok) {
  root.render(<ConfigError problems={config.problems} />);
} else {
  // Developer diagnostics: the configuration's own wording goes to the browser console, never to the screen.
  for (const warning of config.warnings) console.warn(`[foomerang] ${warning}`);
  // ONE runtime for the page's life, created outside React so StrictMode's double-mount cannot
  // open two connections.
  const enabled = parseEnabledParam(window.location.search);
  const enabledOption = enabled === undefined ? {} : { enabled };
  const given = parseGiveParam(window.location.search);
  const givenOption = given === undefined ? {} : { given };
  const kills = parseKillsParam(window.location.search);
  const killsOption = kills === undefined ? {} : { targetKills: kills };
  const runtime = createConsoleRuntime({
    transportFactory: createSocketIOTransportFactory(config.serverUrl),
    store: createHostStore(sessionStorageOrNothing()),
    powerups: parsePowerupsParam(window.location.search),
    // The gong islands for now (the owner, 2026-10-22); ?arena=product rotates them with the plaza; ?arena= pins a map.
    arena: productArena(window.location.search),
    ...enabledOption,
    ...givenOption,
    ...killsOption,
    // each round opens with the reference video's landings, READY and GO (?intro=off for development and tests)
    roundIntroSeconds:
      new URLSearchParams(window.location.search).get('intro') === 'off' ? 0 : ROUND_INTRO.seconds,
    // a kill plays at normal speed (owner, 2026-10-25: "turn off the slo mo death thingy, it's just bad right now"); the HQ
    // video's freeze and slow motion stay behind ?slowmo=on until it is redone
    slowMo: new URLSearchParams(window.location.search).get('slowmo') === 'on',
  });

  // A reload reclaims the same room (the arena simulation itself restarts; see docs/CONSOLE.md).
  runtime.session.resume();

  let renderer: ArenaRenderer | undefined;
  const onRenderer = (next: ArenaRenderer | undefined): void => {
    renderer = next;
  };

  // Development builds only. In production this branch is removed at build time.
  if (import.meta.env.DEV) {
    void import('./debugHook').then(({ installDebugHook }) =>
      installDebugHook(runtime, () => renderer),
    );
  }

  root.render(
    <StrictMode>
      <App
        runtime={runtime}
        gameId={parseGameParam(window.location.search)}
        controllerBaseUrl={config.controllerBaseUrl}
        warnings={config.warnings}
        loadRenderer={(container, arena) => arenaRendererFor(arena ?? 'primitive')(container)}
        onRenderer={onRenderer}
      />
    </StrictMode>,
  );
  // the sound arrives after the first screen (its own chunk): the menus' blips work from the lobby on
  void loadSound();
  // the music: the menus' tracks from the first screen (they start on the first key or tap: browsers hold audio until then)
  music.want('menu');
}
