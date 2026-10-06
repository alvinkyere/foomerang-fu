# Foomerang

Browser-based party gaming platform: a host runs a game on a big screen; players scan a QR code and their phones become controllers. First game: **Foomerang Fu**.

Start with [docs/PRODUCT.md](docs/PRODUCT.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Architectural decisions live in [docs/ADR](docs/ADR).

## Setup

Requirements: Node.js >= 22 (see `.nvmrc`). pnpm is pinned in `package.json` (`packageManager`) and provided by Corepack — you do not install pnpm yourself.

```bash
# One-time: make Corepack's pnpm shim available. Pick ONE:

# a) Node's bin directory is writable by you (nvm / fnm / Volta / Homebrew):
corepack enable

# b) otherwise, install shims into a directory on your PATH — no sudo needed:
mkdir -p "$HOME/.local/bin" && corepack enable --install-directory "$HOME/.local/bin"
# ...and make sure ~/.local/bin is on your PATH.

# If `corepack` is missing (newer Node distributions drop it):  npm install -g corepack

pnpm install
pnpm validate
```

Do not use `sudo` to get tooling working. `pnpm validate` runs format check, lint, typecheck, tests, the build (with bundle budgets) and the Playwright end-to-end suite; it must pass before any change is considered done. The browser tests use your installed **Google Chrome** (Playwright channel `chrome`); no browser download is needed.

## Scripts

| Script                              | What it does                                                   |
| ----------------------------------- | -------------------------------------------------------------- |
| `pnpm validate`                     | format:check + lint + typecheck + test + build + e2e           |
| `pnpm e2e`                          | Playwright: real server + console + two phones (system Chrome) |
| `pnpm e2e:tls` / `pnpm e2e:webkit`  | the same over https/wss / a WebKit engine check (opt-in)       |
| `pnpm dev:demo [--host <addr>]`     | run server + controller + console together                     |
| `pnpm test` / `pnpm typecheck`      | per-package, orchestrated by Turborepo                         |
| `pnpm lint`                         | ESLint, including architecture boundary rules                  |
| `pnpm format` / `pnpm format:check` | Prettier                                                       |

## Try the whole thing

```bash
pnpm dev:demo                       # this computer only
pnpm dev:demo --host 192.168.1.20   # phones on your Wi-Fi: the address THEY use to reach this computer
```

Open the console URL it prints, press **Create room**, scan the QR code (or enter the room code at the controller), press **Start**, and move your thumb. You choose the address phones use; nothing guesses it. For https and real-device testing see [docs/DEVICE_TESTING.md](docs/DEVICE_TESTING.md); for the design see [docs/CONSOLE.md](docs/CONSOLE.md).

### Play Foomerang Fu (combat skeleton)

With the demo running, create a room on the console, join from **two** phones (landscape), press **Start**, steer with the left thumb and tap **THROW** with the right. You throw the way you last walked. A hit kills; the last player standing wins the round and the next one starts after a short pause. See [docs/FOOMERANG_FU.md](docs/FOOMERANG_FU.md) for what is (and deliberately is not) in it. The old one-joystick platform test is at `…:5174/?game=primitive-arena`.

## Try the controller on a phone

```bash
pnpm --filter @foomerang/server start          # the server (:3001)
pnpm --filter @foomerang/controller dev        # the controller (:5173, on your LAN)
pnpm --filter @foomerang/controller dev:host   # a stand-in TV: opens a room, prints join links
```

Open the printed link on a phone on the same Wi-Fi. Details and caveats (plain HTTP, development-only server bind) in [docs/CONTROLLER.md](docs/CONTROLLER.md).

## Working agreements

See [AGENTS.md](AGENTS.md) and [docs/TESTING.md](docs/TESTING.md): test-driven, small slices, architecture reviewed at each checkpoint.
