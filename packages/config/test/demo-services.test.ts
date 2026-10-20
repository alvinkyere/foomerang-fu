import { describe, expect, it } from 'vitest';
import { demoServices } from '../../../scripts/demoServices.mjs';

const urls = { serverUrl: 'http://tv.lan:3001', controllerUrl: 'http://tv.lan:5173' };
const services = demoServices({ ...urls, tls: {} });
const service = (name: string) => {
  const found = services.find(([n]) => n === name);
  if (found === undefined) throw new Error(`no ${name} service`);
  return found;
};

describe('pnpm dev:demo services', () => {
  it('starts the server, the controller and both consoles together', () => {
    expect(services.map(([name]) => name)).toEqual(['server', 'controller', 'console', 'tv']);
  });

  it('serves the console from the Vite dev server for this computer', () => {
    expect(service('console')[1]).toEqual([
      '--filter',
      '@foomerang/console',
      'dev',
      '--strictPort',
    ]);
  });

  it('also serves a production build of the console for a TV browser', () => {
    // A TV browser is slow: the dev server sends 126 unminified files (~8 MB) for the home screen alone, a build sends 4.
    expect(service('tv')[1]).toEqual(['--filter', '@foomerang/console', 'serve:tv']);
  });

  it('bakes the phone and server addresses into both consoles', () => {
    for (const name of ['console', 'tv'])
      expect(service(name)[2]).toMatchObject({
        FOOMERANG_CONTROLLER_URL: urls.controllerUrl,
        FOOMERANG_SERVER_URL: urls.serverUrl,
      });
  });
});
