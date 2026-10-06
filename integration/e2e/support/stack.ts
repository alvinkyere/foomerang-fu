import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer, connect } from 'node:net';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The real thing, on ephemeral ports: the actual Foomerang server (WebSocket only), and the
 * console and controller as Vite dev servers configured through the same environment variables a
 * developer uses (FOOMERANG_CONTROLLER_URL, FOOMERANG_SERVER_URL, VITE_SERVER_URL).
 *
 * Teardown is part of the contract: every child is signalled as a process group, awaited, and then
 * its port is checked to be closed. A leak fails the run instead of being left for the next one.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const HOST = '127.0.0.1';

export interface StackInfo {
  readonly serverUrl: string;
  readonly consoleUrl: string;
  readonly controllerUrl: string;
  /** The console as `vite build` produces it (no development hook), served by `vite preview`. */
  readonly productionConsoleUrl: string;
}

interface Managed {
  readonly name: string;
  readonly port: number;
  readonly child: ChildProcess;
  readonly exited: Promise<void>;
  output(): string;
}

async function freePorts(count: number): Promise<number[]> {
  const servers = await Promise.all(
    Array.from(
      { length: count },
      () =>
        new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
          const server = createServer();
          server.once('error', reject);
          server.listen(0, HOST, () => resolve(server));
        }),
    ),
  );
  const ports = servers.map((server) => {
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    return address.port;
  });
  await Promise.all(
    servers.map((server) => new Promise<void>((done) => server.close(() => done()))),
  );
  return ports;
}

const accepts = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = connect({ port, host: HOST });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });

function launch(
  name: string,
  port: number,
  script: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
): Managed {
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // its own process group, so the whole tree can be signalled
  });
  let output = '';
  const keep = (chunk: Buffer): void => {
    output = (output + chunk.toString()).slice(-4_000);
  };
  child.stdout?.on('data', keep);
  child.stderr?.on('data', keep);
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  return { name, port, child, exited, output: () => output };
}

async function waitUntilListening(service: Managed, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (service.child.exitCode !== null) {
      throw new Error(`${service.name} exited early:\n${service.output()}`);
    }
    if (await accepts(service.port)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `${service.name} did not start listening on ${service.port}:\n${service.output()}`,
  );
}

async function terminate(service: Managed): Promise<void> {
  const { child } = service;
  if (child.exitCode === null && child.pid !== undefined) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // already gone
    }
    const timedOut = await Promise.race([
      service.exited.then(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 5_000)),
    ]);
    if (timedOut) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // already gone
      }
      await service.exited;
    }
  }
}

export async function startStack(): Promise<{ info: StackInfo; stop(): Promise<void> }> {
  const [serverPort, consolePort, controllerPort, previewPort] = await freePorts(4);
  if (
    serverPort === undefined ||
    consolePort === undefined ||
    controllerPort === undefined ||
    previewPort === undefined
  ) {
    throw new Error('could not allocate ports');
  }
  const info: StackInfo = {
    serverUrl: `http://${HOST}:${serverPort}`,
    consoleUrl: `http://${HOST}:${consolePort}`,
    controllerUrl: `http://${HOST}:${controllerPort}`,
    productionConsoleUrl: `http://${HOST}:${previewPort}`,
  };

  // The executable a package declares in its own `bin`, resolved from the app that depends on it.
  const binOf = (dir: string, pkg: string, name: string): string => {
    const manifest = createRequire(join(dir, 'noop.js')).resolve(`${pkg}/package.json`);
    const bin = (
      JSON.parse(readFileSync(manifest, 'utf8')) as { bin: string | Record<string, string> }
    ).bin;
    const relative = typeof bin === 'string' ? bin : bin[name];
    if (relative === undefined) throw new Error(`${pkg} declares no ${name} executable`);
    return join(dirname(manifest), relative);
  };
  const serverDir = join(ROOT, 'apps', 'server');
  const consoleDir = join(ROOT, 'apps', 'console');
  const controllerDir = join(ROOT, 'apps', 'controller');
  const viteArgs = (port: number): string[] => [
    '--host',
    HOST,
    '--port',
    String(port),
    '--strictPort',
  ];

  const services: Managed[] = [];
  const productionDist = mkdtempSync(join(tmpdir(), 'foomerang-e2e-console-'));
  const stop = async (): Promise<void> => {
    await Promise.all(services.map(terminate));
    rmSync(productionDist, { recursive: true, force: true });
    const leaked: string[] = [];
    for (const service of services) {
      if (service.child.exitCode === null && service.child.signalCode === null)
        leaked.push(`${service.name} process`);
      if (await accepts(service.port)) leaked.push(`${service.name} port ${service.port}`);
    }
    if (leaked.length > 0) throw new Error(`E2E teardown left behind: ${leaked.join(', ')}`);
  };

  try {
    const server = launch(
      'server',
      serverPort,
      binOf(serverDir, 'tsx', 'tsx'),
      ['src/main.ts'],
      serverDir,
      { PORT: String(serverPort), HOST },
    );
    const controller = launch(
      'controller',
      controllerPort,
      binOf(controllerDir, 'vite', 'vite'),
      viteArgs(controllerPort),
      controllerDir,
      { VITE_SERVER_URL: info.serverUrl },
    );
    const consoleApp = launch(
      'console',
      consolePort,
      binOf(consoleDir, 'vite', 'vite'),
      viteArgs(consolePort),
      consoleDir,
      { FOOMERANG_SERVER_URL: info.serverUrl, FOOMERANG_CONTROLLER_URL: info.controllerUrl },
    );
    services.push(server, controller, consoleApp);

    // The production build is made with the same configuration variables, into a throwaway directory.
    const consoleEnv = {
      FOOMERANG_SERVER_URL: info.serverUrl,
      FOOMERANG_CONTROLLER_URL: info.controllerUrl,
    };
    const vite = binOf(consoleDir, 'vite', 'vite');
    await new Promise<void>((resolve, reject) => {
      const build = spawn(
        process.execPath,
        [vite, 'build', '--outDir', productionDist, '--emptyOutDir'],
        {
          cwd: consoleDir,
          env: { ...process.env, ...consoleEnv },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let output = '';
      build.stdout.on('data', (c: Buffer) => (output += c.toString()));
      build.stderr.on('data', (c: Buffer) => (output += c.toString()));
      build.once('exit', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`production console build failed:\n${output.slice(-2000)}`)),
      );
    });
    services.push(
      launch(
        'console-production',
        previewPort,
        vite,
        [
          'preview',
          '--host',
          HOST,
          '--port',
          String(previewPort),
          '--strictPort',
          '--outDir',
          productionDist,
        ],
        consoleDir,
        consoleEnv,
      ),
    );
    await Promise.all(services.map((service) => waitUntilListening(service)));
  } catch (error) {
    await stop().catch(() => undefined);
    throw error;
  }
  return { info, stop };
}
