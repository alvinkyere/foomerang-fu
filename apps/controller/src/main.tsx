import {
  createControllerSession,
  createSocketIOTransportFactory,
  createStorageSessionStore,
} from '@foomerang/controller-sdk';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { parseRoomParam, resolveServerUrl } from './config';
import './styles.css';

function sessionStorageOrNothing(): Storage | undefined {
  try {
    return window.sessionStorage; // per tab: cleared when the tab closes
  } catch {
    return undefined; // blocked site data
  }
}

const room = parseRoomParam(window.location.search);

// ONE session for the page's life, created outside React so StrictMode's double-mount can't open
// two connections. The UI talks to it through a narrow port and never sees a socket.
const session = createControllerSession({
  transportFactory: createSocketIOTransportFactory(
    resolveServerUrl({
      search: window.location.search,
      protocol: window.location.protocol,
      hostname: window.location.hostname,
      envUrl: import.meta.env['VITE_SERVER_URL'] as string | undefined,
      allowOverride: import.meta.env.DEV,
    }),
  ),
  store: createStorageSessionStore(sessionStorageOrNothing()),
});

// A reload (or an accidental swipe-away) reclaims the same player instead of asking again.
session.resume(room);

const root = document.getElementById('root');
if (root === null) throw new Error('missing #root');
createRoot(root).render(
  <StrictMode>
    <App session={session} initialRoom={room} />
  </StrictMode>,
);
