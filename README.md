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

Do not use `sudo` to get tooling working. `pnpm validate` runs format check, lint, typecheck and tests; it must pass before any change is considered done.

## Scripts

| Script                              | What it does                                  |
| ----------------------------------- | --------------------------------------------- |
| `pnpm validate`                     | format:check + lint + typecheck + test        |
| `pnpm test` / `pnpm typecheck`      | per-package, orchestrated by Turborepo        |
| `pnpm lint`                         | ESLint, including architecture boundary rules |
| `pnpm format` / `pnpm format:check` | Prettier                                      |

## Try the controller on a phone

```bash
pnpm --filter @foomerang/server start          # the server (:3001)
pnpm --filter @foomerang/controller dev        # the controller (:5173, on your LAN)
pnpm --filter @foomerang/controller dev:host   # a stand-in TV: opens a room, prints join links
```

Open the printed link on a phone on the same Wi-Fi. Details and caveats (plain HTTP, development-only server bind) in [docs/CONTROLLER.md](docs/CONTROLLER.md).

## Working agreements

See [AGENTS.md](AGENTS.md) and [docs/TESTING.md](docs/TESTING.md): test-driven, small slices, architecture reviewed at each checkpoint.
