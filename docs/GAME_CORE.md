# GAME CORE — deterministic simulation

Status: v0.1 (Slice 5). Package: `packages/game-core` — pure TypeScript, **no dependencies**, no DOM/Node/React/Phaser/Socket.IO, no ambient time or randomness (enforced by lint, the DOM-free tsconfig and boundary tests).

## The shape

```
nextState = step(previousState, inputs, dt)
```

A pure function: same state + same input frame + same `dt` ⇒ same result; arguments are never mutated; unchanged bodies are returned by reference so change detection is cheap. `step` reads no clock and draws no randomness.

## Units

| Quantity | Unit |
| --- | --- |
| positions, radii, arena size | **world units** |
| speed | world units **per second** |
| time, `dt` | **seconds** |

Never pixels, never "per frame". Rendering decides how world units map to a screen (720p, 4K, a phone…). Tested: the same simulated second covers the same distance whether run as 10, 30, 60 or 120 steps.

## Time

- **Fixed step: 60 Hz** (`FIXED_TIMESTEP_SECONDS = 1/60`). Simulation and rendering are independent: a render frame may run 0, 1 or several simulation steps (accumulator model), so a TV rendering at 45 FPS does not make characters slower. **The accumulator is not part of this package** — it belongs to the loop in the console/server (later slice).
- `dt` contract: **0 is a valid no-op** (same state back); negative, NaN, ±Infinity, or greater than `MAX_STEP_SECONDS` (**0.1 s = 6 fixed steps**) throw `RangeError`. The cap exists so a stalled tab or bad clock becomes a loud error rather than a teleport; the loop splits or discards the excess.
- `state.time` advances by exactly `dt` each step. There is no clock inside the simulation.

## Input pipeline

```
protocol axes  x,y ∈ [-1,1], finite   (validated at the wire boundary)
   → non-finite? → zero movement (defensive; garbage can never poison state)
   → shrink out-of-range to the unit square (no overflow, direction kept)
   → radial dead zone: magnitude ≤ deadZone → zero
   → rescale (deadZone, 1] onto (0, 1]   (0.15→0, 0.575→0.5, 1→1: no jump at the edge)
   → clamp magnitude to 1                (the (1,1) corner is √2 long)
   → × maxSpeed × dt → new position → clamp to arena
```

`MovementInput` is deliberately **generic, not joystick-specific**: a touch stick, keyboard, gamepad, D-pad or accessibility controller all reduce to it. Default dead zone **0.15**, configurable per world (`[0, 1)`). `(1,1)` moves at exactly the same speed as `(1,0)` (regression-tested for all 8 directions, hostile out-of-range input, and a full circle of angles).

## World state (plain, serializable, complete)

`WorldState { time, arena, movement{maxSpeed, deadZone}, bodies[] }`; `Body { id, position (center), radius }`. The rules it runs under travel with it, so a JSON snapshot taken mid-match and resumed later produces exactly the same future (tested). `maxSpeed` is chosen by the game; there is no default.

**Input frames** are `Map<id, MovementInput>`, keyed by id, never by array position. An id **absent** from the frame means **zero movement** this step — the simulation never "keeps doing what it was doing"; repeating the latest state is the network layer's decision. Unknown ids are ignored. Frame insertion order is irrelevant.

Ids are plain strings so the package needs no dependencies; a branded `PlayerId` from room-engine is assignable to it.

## Arena

A rectangle `(0,0)–(width,height)`. The body **center** is kept `radius` away from every wall so the circle itself never leaves the arena (all four walls and corners tested; each body uses its own radius). Axes clamp independently, so pushing diagonally into a wall **slides** along it. Worlds reject bodies that don't fit.

## Determinism — the honest claim

Same inputs ⇒ same outputs **within a given runtime**. That is the practical requirement for replays, debugging and a host/server running the same engine. It is **not** a claim of bit-identical floating-point results across every JS engine and architecture; if lockstep networking across heterogeneous runtimes is ever needed, numerical guarantees must be revisited then.

## Seeded randomness

`RandomSource { next(): number in [0,1) }`, implemented as mulberry32 (`createSeededRandom(seed)`, integer seeds `0…2³²−1`). Integer arithmetic only, with golden-value tests pinning the sequence. Not cryptographic; never for credentials. The simulation itself does not use it — movement needs no randomness. If a game rule later draws from it mid-match and the match must be snapshotted, the RNG state must become part of `WorldState`.

## Deliberately out of scope (Slice 5)

Walls/obstacles, player–player collision (bodies currently pass through each other), acceleration, friction, dash, boomerangs, knockback, combat, health, power-ups, animation, rendering, Phaser physics, the real-time loop/accumulator.

## Unresolved questions

1. **Y-axis orientation.** `+y` input increases `y`; "up" on screen is the renderer's convention (screen coordinates usually grow downward). The controller's joystick mapping must agree; decide with the first end-to-end (Slice 7/8).
2. **Adding/removing bodies mid-match** (late join, elimination): `createWorld` fixes the body set; the API for changing it is a Foomerang Fu rules concern (Slice 4-of-the-game, M5).
3. **RNG state in `WorldState`** once a rule draws from it.
4. **Where the accumulator lives** (console and, later, server) and how it discards time beyond `MAX_STEP_SECONDS`.
5. **Whether a game should be able to override `MAX_STEP_SECONDS`.**
