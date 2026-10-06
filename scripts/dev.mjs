// One command to run the whole stack for a person (or a phone) to try:
//
//   pnpm dev:demo                                  # this computer only (a phone cannot reach it)
//   pnpm dev:demo --host 192.168.1.20              # phones on your Wi-Fi: the address THEY use to reach this computer
//   pnpm dev:demo --host 192.168.1.20 --tls-cert certs/dev.pem --tls-key certs/dev-key.pem   # https / wss
//
// The address is always given by you. Nothing here (or in the console) guesses a LAN address.
// Ctrl-C stops everything it started.
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};

const host = option('host') ?? 'localhost';
const cert = option('tls-cert');
const key = option('tls-key');
if ((cert === undefined) !== (key === undefined)) {
  console.error('Give both --tls-cert and --tls-key, or neither.');
  process.exit(1);
}
const scheme = cert === undefined ? 'http' : 'https';
const tls = cert === undefined ? {} : { FOOMERANG_TLS_CERT: cert, FOOMERANG_TLS_KEY: key };

const serverUrl = `${scheme}://${host}:3001`;
const controllerUrl = `${scheme}://${host}:5173`;
const consoleUrl = `${scheme}://${host}:5174`;

const services = [
  ['server', ['--filter', '@foomerang/server', 'start'], { ...tls }],
  [
    'controller',
    ['--filter', '@foomerang/controller', 'dev'],
    { ...tls, VITE_SERVER_URL: serverUrl },
  ],
  [
    'console',
    ['--filter', '@foomerang/console', 'dev'],
    { ...tls, FOOMERANG_CONTROLLER_URL: controllerUrl, FOOMERANG_SERVER_URL: serverUrl },
  ],
];

const children = services.map(([name, pnpmArgs, env]) => {
  const child = spawn('pnpm', pnpmArgs, {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // its own process group, so Ctrl-C can stop the whole tree
  });
  const prefix = `[${name}] `;
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n'))
        if (line.trim() !== '') console.log(prefix + line);
    });
  }
  child.once('exit', (code) => {
    if (!stopping) {
      console.error(`${prefix}exited (${code}); stopping the rest.`);
      stop(1);
    }
  });
  return child;
});

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
  setTimeout(() => process.exit(code), 1500);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

console.log(`
  Foomerang is starting.

  On the big screen, open the console:   ${consoleUrl}
  Phones will be sent to:                ${controllerUrl}
  Game server:                           ${serverUrl}
${
  host === 'localhost'
    ? "\n  NOTE: --host was not given, so a phone cannot reach this. Use --host <this computer's address on your Wi-Fi>.\n"
    : ''
}
  Press Ctrl-C to stop everything.
`);
