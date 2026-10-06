import { createSocketIOTransportFactory } from '@foomerang/controller-sdk';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { parseGameParam, resolveConsoleConfig } from './config';
import { createConsoleRuntime } from './consoleRuntime';
import {
  parseArenaParam,
  parseEnabledParam,
  parseKillsParam,
  parsePowerupsParam,
} from './runtime/powerupMode';
import { createHostStore } from './host';
import type { ArenaRenderer } from './render/renderer';
import { phaserRendererFor } from './render/phaser/loadPhaserRenderer';
import { App } from './ui/App';
import { ConfigError } from './ui/ConfigError';
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
const config = resolveConsoleConfig({
  protocol: window.location.protocol,
  hostname: window.location.hostname,
  controllerUrl: import.meta.env['FOOMERANG_CONTROLLER_URL'] as string | undefined,
  serverUrl: import.meta.env['FOOMERANG_SERVER_URL'] as string | undefined,
});

if (!config.ok) {
  root.render(<ConfigError problems={config.problems} />);
} else {
  // ONE runtime for the page's life, created outside React so StrictMode's double-mount cannot
  // open two connections.
  const enabled = parseEnabledParam(window.location.search);
  const enabledOption = enabled === undefined ? {} : { enabled };
  const kills = parseKillsParam(window.location.search);
  const killsOption = kills === undefined ? {} : { targetKills: kills };
  const runtime = createConsoleRuntime({
    transportFactory: createSocketIOTransportFactory(config.serverUrl),
    store: createHostStore(sessionStorageOrNothing()),
    powerups: parsePowerupsParam(window.location.search),
    arena: parseArenaParam(window.location.search),
    ...enabledOption,
    ...killsOption,
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
        serverUrl={config.serverUrl}
        warnings={config.warnings}
        loadRenderer={phaserRendererFor(parseArenaParam(window.location.search))}
        onRenderer={onRenderer}
      />
    </StrictMode>,
  );
}
