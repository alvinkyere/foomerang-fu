# ADR-003: Vite + React for console and controller; Next.js reserved for marketing

Status: Accepted (review v0.2)
Date: 2026-10-05

## Context
The console and controller are client-side applications with no SEO or SSR needs. The controller's critical metric is QR scan → interactive; six people are waiting. The console, once PLAY is pressed, must be predictable with minimal framework machinery around a Phaser canvas. A future marketing/discovery site has different needs (SEO, content, eventually accounts).

## Options
1. Next.js for everything. 2. Vite for console and controller; Next.js only for a future marketing site. 3. Vite for controller, Next.js for console.

## Decision
Option 2. `apps/console`: Vite + React + Phaser. `apps/controller`: Vite + React, kept extremely lean with a tracked bundle budget. `website/` (Next.js) is deferred and out of Milestone 1.

## Consequences
+ Fast loads, simple mental model, clear product boundary.
− Two build configs (shared via `packages/config`). Marketing site later is a separate app sharing `packages/ui` where sensible.
