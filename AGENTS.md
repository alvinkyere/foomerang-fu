<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# Foomerang repository guidance

<!-- Authority: docs/SRS.md, docs/ARCHITECTURE.md and docs/ADR/* are authoritative. If anything here contradicts them, the ADR wins. This section is operational guidance only; do not record architecture decisions here. -->

- **Setup & validation:** see `README.md`. `pnpm validate` must pass before work is reported done. Never use `sudo` to fix tooling.
- **Workflow:** one small vertical slice at a time. TDD: write the failing test, show it fails for the expected reason, implement minimally, refactor, run `pnpm validate`. Never weaken a legitimate failing test. Stop at each slice boundary for architecture review; do not start the next slice unprompted.
- **Boundaries are lint- and test-enforced** (`packages/config/test`). Do not work around them; if a rule seems wrong, raise it. In particular: pure packages (`game-core`, `protocol`, `room-engine`, `games/foomerang-fu/src/rules`) take time and randomness by injection and never touch DOM, Node, React, Phaser or Socket.IO; Socket.IO appears only in `SocketIOTransport*` files; Phaser only in `games/foomerang-fu/src/render`.
- **Validation (Zod) only at trust boundaries** (wire input). Internal code relies on types.
- **Dependencies:** justify every new one; pick versions from verified registry/compatibility data, not "latest".
- **Treat all network input as hostile.** Never log tokens.
