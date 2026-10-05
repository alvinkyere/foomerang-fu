# ADR-001: TypeScript monorepo with pnpm and Turborepo

Status: Proposed
Date: 2026-10-05

## Context
Three deployables (console, controller, server) and several libraries must share a single protocol definition and test config. Protocol drift between independently maintained clients and server is the most likely source of subtle bugs. One developer; velocity and type-safety across boundaries matter most.

## Options
1. **Monorepo, pnpm workspaces + Turborepo.** Shared types, atomic cross-package changes, cached task graph.
2. **Monorepo, pnpm workspaces only.** Simpler; no task caching/orchestration.
3. **Polyrepo.** Isolation, but protocol versioning/publishing overhead is unjustified at this size.

## Decision
Option 1: pnpm workspaces + Turborepo, TypeScript strict everywhere, project layout per ARCHITECTURE.md. Turborepo is the only optional piece; if its overhead outweighs benefit in M1 we can drop to option 2 cheaply.

## Consequences
+ One protocol package consumed by all apps; refactors are atomic.
+ Single lint/test/tsc configuration in `packages/config`.
− Tooling setup cost up front; build graph must be maintained.
− Enforcing dependency direction (packages must not import apps/games) needs lint rules.
