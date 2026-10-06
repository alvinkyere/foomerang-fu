// One command to run the whole stack for a person (or a phone) to try:
//
//   pnpm dev:demo                                  # this computer only (a phone cannot reach it)
//   pnpm dev:demo --host 192.168.1.20              # phones on your Wi-Fi: the address THEY use to reach this computer
//   pnpm dev:demo --host 192.168.1.20 --tls-cert certs/dev.pem --tls-key certs/dev-key.pem   # https / wss
//
// The address is always given by you. Nothing here (or in the console) guesses a LAN address.
// Ctrl-C stops everything it started.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

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

// Refuse to start if a port is taken. Otherwise Vite quietly moves to another port, and the QR code
// and server address would point at the wrong place (often at an OLD run of this same script).
const PORTS = [3001, 5173, 5174];
const taken = [];
for (const port of PORTS) {
  const free = await new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '0.0.0.0', () => probe.close(() => resolve(true)));
  });
  if (!free) taken.push(port);
}
if (taken.length > 0) {
  console.error(`
  Port${taken.length > 1 ? 's' : ''} ${taken.join(', ')} already in use — probably an earlier run of this script that is still going.
  Find what is using ${taken.length > 1 ? 'them' : 'it'}:   lsof -nP ${taken.map((port) => `-iTCP:${port}`).join(' ')} -sTCP:LISTEN
  Stop it (kill <PID>), or:             pkill -f scripts/dev.mjs; pkill -f vite
`);
  process.exit(1);
}

const services = [
  ['server', ['--filter', '@foomerang/server', 'start'], { ...tls }],
  [
    'controller',
    ['--filter', '@foomerang/controller', 'dev', '--strictPort'],
    { ...tls, VITE_SERVER_URL: serverUrl },
  ],
  [
    'console',
    ['--filter', '@foomerang/console', 'dev', '--strictPort'],
    { ...tls, FOOMERANG_CONTROLLER_URL: controllerUrl, FOOMERANG_SERVER_URL: serverUrl },
  ],
];

// Run children with the SAME pnpm that started this script (it may only be reachable through
// `corepack pnpm`, not as a bare `pnpm` on PATH).
const execPath = process.env.npm_execpath;
const pnpmCommand =
  execPath === undefined
    ? ['pnpm']
    : /\.(c|m)?js$/.test(execPath)
      ? [process.execPath, execPath] // a JavaScript entry point
      : [execPath]; // a native executable (as Corepack provides)

const children = services.map(([name, pnpmArgs, env]) => {
  const child = spawn(pnpmCommand[0], [...pnpmCommand.slice(1), ...pnpmArgs], {
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
  child.once('error', (error) => {
    console.error(`${prefix}could not start: ${error.message}`);
    stop(1);
  });
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
