# PROTOCOL

Status: v0.3 — **foundations implemented** in `packages/protocol` (Slice 2). Everything marked _planned_ is not built yet.

The package owns wire formats, schemas, versioning and validation semantics. It does **not** own behavior: join-code _generation_ and collision handling belong to `room-engine`. It has no dependency on React, browser APIs, Socket.IO, or Node (a native client must be able to implement it), and its only runtime dependency is Zod.

## Trust boundary

```
unknown (from the wire) ──► parseClientMessage ──► ClientMessage (typed)  | ErrorCode
```

- Validation (Zod) happens **only** here. Internal code carries the guarantee in TypeScript types and never re-parses.
- `parseClientMessage` / `parseServerMessage` never throw (throwing getters, revoked proxies, circular objects, megabyte strings all yield `INVALID_MESSAGE`).
- Objects are **strict**: unknown keys are rejected (including a `__proto__` key arriving from JSON), not stripped.
- Direction is enforced: a client cannot send `ERROR` or `HEARTBEAT_ACK`, so it cannot forge server messages.
- Payload-size limits and rate limits are the transport/server's job (see ARCHITECTURE security posture); the schemas bound every string they contain.

## Versioning

- `protocolVersion` (integer, currently `1`): wire compatibility. Bumped **only** for breaking wire changes.
- `clientVersion` (semver string, e.g. `0.1.0`): the application release. Informational. Releasing app `0.2.0` does not imply a protocol change.
- A handshake with a well-formed but unsupported `protocolVersion` gets `UNSUPPORTED_PROTOCOL` **even if the rest of its payload has an unknown shape**, so a future client can show an upgrade prompt rather than a generic failure. A non-positive-integer version is malformed → `INVALID_MESSAGE`.

## Envelopes (by semantics, not one universal packet)

| Class     | Shape                            | Used by                              |
| --------- | -------------------------------- | ------------------------------------ |
| plain     | `{ type, payload }`              | `HANDSHAKE`, `ERROR`                 |
| state     | `{ type, seq, payload }`         | `INPUT_MOVE` (latest-wins)           |
| event     | `{ type, seq, eventId, payload }`| `INPUT_EVENT` (reliable, dedup'd)    |
| heartbeat | `{ type, seq }`                  | `HEARTBEAT`, `HEARTBEAT_ACK`         |

Protocol version is negotiated **once** in the handshake, not repeated per message (inputs flow at 30–60 Hz). _Deviation from the review's example envelope, which showed `protocolVersion` on every message — flagged for confirmation._

No timestamps yet: `t` fields for input-age measurement are added when the latency instrumentation slice needs them.

- `seq`: unsigned 32-bit integer per stream. Stale `seq` is dropped by the receiver; ordering never relies on cross-device clocks. Wraparound is unsupported (~2 years at 60 Hz).
- `eventId`: client-generated, `[A-Za-z0-9_-]{8,64}`, unique per event within a session. Deliberately **not** a UUID — `crypto.randomUUID()` is unavailable in insecure contexts (e.g. a phone loading the controller over plain HTTP on a LAN).

## Messages

### Client → server

| Type          | Envelope  | Payload                                                          |
| ------------- | --------- | ---------------------------------------------------------------- |
| `HANDSHAKE`   | plain     | `{ protocolVersion, clientType, clientVersion }`                 |
| `INPUT_MOVE`  | state     | `{ x, y }`, each finite in `[-1, 1]`                             |
| `INPUT_EVENT` | event     | `{ action: PRIMARY\|SECONDARY, phase: pressed\|released }`       |
| `HEARTBEAT`   | heartbeat | —                                                                |

`clientType`: `console` \| `controller` \| `native-controller`.

### Server → client

| Type            | Envelope  | Payload                          |
| --------------- | --------- | -------------------------------- |
| `ERROR`         | plain     | `{ code }` (an `ErrorCode`)      |
| `HEARTBEAT_ACK` | heartbeat | — (echoes `seq`; also yields RTT)|

### Planned (not built): room join/create/reconnect, host messages, roster updates, controller manifest, match lifecycle, `GAME_STATE`.

## Joystick semantics

Normalized and screen-independent: center `(0,0)`, full right `(1,0)`, full left `(-1,0)`. Never pixels. The **game** owns dead zone, speed and acceleration.

Only the per-axis range is validated. Magnitude (`x²+y² ≤ 1`) is **not** rejected — legitimate `cos`/`sin` output can exceed 1 by an epsilon, and `(1,1)` is range-valid. **The simulation must clamp magnitude to the unit disc**, otherwise a hostile controller gains √2 speed on diagonals. NaN/±Infinity/out-of-range values never reach the simulation.

## Actions vs state

- Movement is **state**: latest-wins, loss-tolerant.
- Actions are **events**: never dropped or coalesced. The schema accepts a repeated `eventId`; **deduplication is receiver state** (use a `Map`/`Set`, never a plain object keyed by `eventId`), so a retried press can never throw twice.

## Join code

Six characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no `0 O 1 I L`; 31⁶ ≈ 887M). Case-insensitive on input, canonical uppercase. Validated as ASCII **before** case folding, so `ſ` (→`S`) and `ß` (→`SS`) cannot sneak in. The protocol defines what a valid code _looks like_; room-engine decides which codes are _available_. `roomId` (a UUID) is a separate machine identity and never user-facing.

## Error codes

Stable machine identifiers; renaming or removing is a breaking change, adding is additive. Consumer copy ("This game is full.") lives in the clients.

`INVALID_MESSAGE`, `UNSUPPORTED_PROTOCOL`, `ROOM_NOT_FOUND`, `ROOM_FULL`, `INVALID_RECONNECT_TOKEN`, `RATE_LIMITED`, `UNAUTHORIZED`.

## Identity (_planned_, designed in ARCHITECTURE)

`roomId` (UUID) ≠ `joinCode`; `hostId`/`hostToken`; `playerId` (stable) vs `connectionId` (changes); `reconnectToken` (CSPRNG ≥128 bits, never logged or broadcast).
