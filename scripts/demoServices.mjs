// The processes `pnpm dev:demo` starts (scripts/dev.mjs). Tested in packages/config/test/demo-services.test.ts.
//
// The console runs twice: the Vite dev server for this computer (:5174), and a production build for a TV's browser
// (:5175, apps/console/scripts/serve-tv.mjs). A TV browser is slow, and the dev server sends 126 unminified files
// (~8 MB) for the home screen alone where a build sends 4. Both read the addresses at build time.
export function demoServices({ tls, serverUrl, controllerUrl }) {
  const consoleEnv = {
    ...tls,
    FOOMERANG_CONTROLLER_URL: controllerUrl,
    FOOMERANG_SERVER_URL: serverUrl,
  };
  return [
    ['server', ['--filter', '@foomerang/server', 'dev'], { ...tls }],
    [
      'controller',
      ['--filter', '@foomerang/controller', 'dev', '--strictPort'],
      { ...tls, VITE_SERVER_URL: serverUrl },
    ],
    ['console', ['--filter', '@foomerang/console', 'dev', '--strictPort'], consoleEnv],
    ['tv', ['--filter', '@foomerang/console', 'serve:tv'], consoleEnv],
  ];
}
