# SHELL — the Foomerang console product shell

Status: **the production host UI.** The root route of the console app is this shell. The old lobby is gone. Controllers (as a full screen), Pause and Results still use the arena's own screens and come next.

Isolated UI harness (fixtures only, development only, NOT the product): `pnpm --filter @foomerang/console dev`, open `/harness.html` (`?screen=home|detail|settings|join`, `&join=loading|ready|reconnecting`, `&seats=default|empty|full`, `&category=…`). Screenshots of the harness: `node apps/console/scripts/shell-shots.mjs [--size 1920x1080]` → `docs/shell/`.

## Layout of the code (`apps/console/src/shell`)

| Piece                          | Role                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tokens.css`, `components.css` | The design system. Everything is `rem`; the root size follows the viewport so any 16:9 screen lays out identically.                                                                                                |
| `focus/`                       | `navigation.ts` (pure spatial navigation), `inputMap.ts` (keyboard + gamepad → `up/down/left/right/select/back`), `FocusController.ts` (scope stack, real DOM focus, memory), `FocusManager.tsx` (React bindings). |
| `components/`                  | Presentation primitives. They take props only and never import the session, runtime or transport (`test/shell/components.test.tsx` enforces it).                                                                   |
| `screens/`                     | Home, GameDetail, Settings, Join: presentation with props.                                                                                                                                                         |
| `settings.ts`                  | The settings that are real today, applied to `<html>`; stored data is validated.                                                                                                                                   |
| `sound.ts`                     | Sound **hooks** only (no audio ships yet).                                                                                                                                                                         |
| `ShellPreview.tsx`             | Fixture adapter used for review. Propagation replaces it with an adapter from `HostSession` / `MatchDirector`; screens and components do not change.                                                               |

## Input model

Arrows / D-pad / left stick = navigate · Enter / Space / A = select · Esc / Backspace / B = back. **Phones** drive the same focus (never a menu of their own): outside gameplay the host translates a phone's stick into steps, SLASH into select and THROW into back, and `App` hands that stream (`runtime.menu`) to `FocusManager` as its `remote` input (the shell sees only a structural `RemoteInput`; DASH's secondary action is dropped until a screen offers one). The arena mounts its own `FocusManager` with the same feed: Esc / B there opens the **pause menu** (`screens/PauseMenu.tsx`: Resume · Return to Lobby, the latter confirmed on the TV starting on Cancel), and the champion screen's Rematch / Return to lobby are focus items. Mouse hover mirrors focus; click selects; nothing depends on hover. Every screen is a `FocusScope` with a deterministic initial focus; leaving and re-entering a screen restores where you were; Back always leaves; unavailable buttons stay focusable (they say why) but cannot fire.

## What is real

- Room code, QR, join link, seats (colour/number/shape from the stable slot), connection states, CPUs (add / level / remove), START eligibility and its reason, reconnecting, room closure and failures all come from the live session through the adapter. A phone's state is shown as **Connected** — the session has no ready state and none is invented.
- System bar: **Settings** is a full screen; **Players** opens Join when a room is open (otherwise says how to start one); **Controllers**, **Help**, **About** are information sheets (Controllers is a guide for now, not a management screen).

## Deliberately absent

Settings rows with nothing behind them (Audio, Screen Shake, Effects Intensity, Master Volume, Gameplay) are not shown until they are wired.
