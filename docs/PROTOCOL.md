# PROTOCOL

Status: v0.4 — foundations (Slice 2) plus the room/host messages needed by the server (Slice 6) are implemented in `packages/protocol`. Everything marked _planned_ is not built yet.

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

## Connection lifecycle

```
CONNECT → UNNEGOTIATED → HANDSHAKE → validate protocolVersion → ACTIVE
                                                  └── incompatible → REJECT (UNSUPPORTED_PROTOCOL)
```

Once `ACTIVE`, every message on that connection is interpreted under the negotiated protocol. **A reconnect is a new transport connection and handshakes again.** Player/host identity can survive a reconnect (via credentials); protocol negotiation does not. Before `ACTIVE`, anything other than `HANDSHAKE` is rejected by the session layer (the session layer, not the parser, tracks this state).

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
- `eventId`: client-generated, `[A-Za-z0-9_-]{8,64}`. The required **property** is not "is a UUID" but "this action instance is distinguishable from another sufficiently to deduplicate retries". Implementation is the client's choice (e.g. session-specific entropy + monotonic counter); we define properties, not mechanisms. Deliberately not a UUID — `crypto.randomUUID()` is unavailable in insecure contexts (e.g. a phone loading the controller over plain HTTP on a LAN).
- **Bounded deduplication (requirement for the action-processing slice):** receivers dedupe with a `Set<string>`/`Map`, but storage must be bounded — a 7-hour room must not retain every eventId ever received. Use a sliding window / expiry sized to the maximum retry horizon.

## Messages

### Client → server

| Type               | Envelope  | Payload                                                          | Who may send it |
| ------------------ | --------- | ---------------------------------------------------------------- | --------------- |
| `HANDSHAKE`        | plain     | `{ protocolVersion, clientType, clientVersion }`                 | anyone, once, first |
| `HEARTBEAT`        | heartbeat | —                                                                | any ACTIVE connection |
| `ROOM_CREATE`      | plain     | `{ gameId }` (`[a-z0-9-]`, ≤64)                                  | console without a room |
| `HOST_RECONNECT`   | plain     | `{ joinCode, hostToken }`                                        | console without a room |
| `MATCH_START`      | plain     | `{}` (strict) — begins the match: `LOBBY → STARTING → PLAYING`; answers `NOT_ENOUGH_PLAYERS` / `INVALID_STATE` if it cannot | the room's host |
| `ROOM_JOIN`        | plain     | `{ joinCode, displayName }` (wire-bounded ≤64; domain applies the real rules) | controller without an identity |
| `PLAYER_RECONNECT` | plain     | `{ joinCode, reconnectToken }`                                   | controller without an identity |
| `INPUT_MOVE`       | state     | `{ x, y }`, each finite in `[-1, 1]`                             | joined player |
| `INPUT_EVENT`      | event     | `{ action: PRIMARY\|SECONDARY, phase: pressed\|released }` (the sender's `eventId` makes it deduplicable; a manifest `button` sends exactly one pressed and one released per press) | joined player |

`clientType`: `console` \| `controller` \| `native-controller` (a native controller is authorized exactly like a controller). The "who may send it" column is enforced by the server's session layer (`UNAUTHORIZED` otherwise), not by the parser.

### Server → client

| Type                 | Envelope  | Payload                                                          | To |
| -------------------- | --------- | ---------------------------------------------------------------- | -- |
| `HANDSHAKE_ACCEPTED` | plain     | `{ protocolVersion }`                                            | the new connection |
| `ERROR`              | plain     | `{ code }` (an `ErrorCode`)                                      | the sender |
| `HEARTBEAT_ACK`      | heartbeat | — (echoes `seq`; also yields RTT)                                | the sender |
| `ROOM_CREATED`       | plain     | `{ joinCode, hostToken }`                                        | the creating console |
| `HOST_RECONNECTED`   | plain     | `{ joinCode, hostToken }` (**new** credential; the old one is dead) | the reconnecting console |
| `ROOM_JOINED`        | plain     | `{ playerId, reconnectToken }`                                   | the joining controller |
| `PLAYER_RECONNECTED` | plain     | `{ playerId, reconnectToken }` (**new** credential)              | the reconnecting controller |
| `ROOM_UPDATED`       | plain     | `{ joinCode, state, hostConnection, players[{ playerId, displayName, connection, seat }] }` — a full roster snapshot (≤64 players) | the room's host |
| `CONTROLLER_MANIFEST` | plain    | `{ gameId, orientation: landscape\|portrait\|any, controls[{ id, type: joystick }] }` (1–16 controls, unique `[A-Z][A-Z0-9_]*` ids) — what the controller should render, from the GAME's definition | the controller, after `ROOM_JOINED` / `PLAYER_RECONNECTED` |
| `PLAYER_INPUT`       | plain     | `{ playerId, input: MOVE{seq,x,y} \| ACTION{eventId,action,phase} }` | the room's host |

Credentials (`hostToken`, `reconnectToken`) appear **only** in the reply to their owner. Rosters carry identities and statuses, never credentials (the schema is strict, so a smuggled field is invalid). `PLAYER_INPUT` is only sent after the server has authenticated the sender, discarded stale movement and deduplicated action events.

### Planned (not built): more control types (the manifest knows only `joystick` because that is all the controller implements), roster/status messages for controllers, match lifecycle (`MATCH_*`), `GAME_STATE`, room closing.

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

Added in Slice 6 (additive), each because the server's translation layer needed a distinct answer: `ROOM_NOT_JOINABLE`, `INVALID_DISPLAY_NAME`, `SEAT_RELEASED`, `ROOM_CLOSING`, `UNKNOWN_GAME`, `HANDSHAKE_REQUIRED` (anything but a handshake first, or no handshake in time), `INTERNAL_ERROR` (a server fault; never carries details).

Added in Slice 8 (additive): `NOT_ENOUGH_PLAYERS` (the host asked to start with fewer players than the game needs) and `INVALID_STATE` (the room cannot make that transition now).

## Identity (_planned_, designed in ARCHITECTURE)

`roomId` (UUID) ≠ `joinCode`; `hostId`/`hostToken`; `playerId` (stable) vs `connectionId` (changes); `reconnectToken` (CSPRNG ≥128 bits, never logged or broadcast).
