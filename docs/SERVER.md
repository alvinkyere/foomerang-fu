# SERVER — transport, session layer and room coordination

Status: v0.1 (Slice 6). Package: `apps/server`. This is the first network-facing code, so the rule is: **every client is hostile or broken.**

## Layers (and what each answers)

```
Socket.IO
   │
   ▼
SocketIOTransport      How do messages travel?              (the ONLY file family that knows Socket.IO)
   │  TransportConnection { id, send, close, onMessage, onClose }
   ▼
Gateway (session layer) Who is this connection allowed to act as?
   │  classify → rate-limit → parse (trust boundary) → lifecycle → authorize
   ▼
Application            What does this authorized request do?
   │  translation: domain result → protocol ErrorCode
   ▼
room-engine (RoomRegistry)    protocol (parser/schemas)    [game-core: not wired yet]
```

- Socket.IO imports are confined to `*SocketIOTransport*` files by lint (`packages/config/test` proves it). Nothing outside calls `socket.emit` / `socket.on`; nothing exported from the package exposes a Socket.IO type, so another transport can replace it by implementing `ServerTransport`.
- Payloads are `unknown` from the wire until `parseClientMessage` accepts them. Parsing precedes authorization, which precedes any domain operation.
- Session identity is **never** inferred from the socket id, IP address, display name or join code. Credentials establish identity; the connection id is diagnostic only.

## Connection lifecycle

```
CONNECTED TRANSPORT ─► UNNEGOTIATED ──valid HANDSHAKE──► ACTIVE ──close──► CLOSED
                            └─ invalid / unsupported / not-a-handshake / timeout / abuse ─► REJECTED ─► CLOSED
```

- Anything other than a valid `HANDSHAKE` first is refused (`HANDSHAKE_REQUIRED`, `INVALID_MESSAGE` or `UNSUPPORTED_PROTOCOL`) and the connection is **closed**. `INPUT_MOVE` then `HANDSHAKE` cannot launder the movement: the connection is gone before the handshake is read.
- **Handshake deadline: 5 s** (configurable). It is a scheduled timer in the *server* layer through an injected `Scheduler`; tests drive a manual scheduler and never sleep.
- Negotiation happens once per transport connection. A **reconnect is a new connection** and handshakes again; player/host identity survives via credentials, protocol negotiation does not.

## Authorization (checked after parsing, before the application)

| Message | Allowed for |
| --- | --- |
| `HEARTBEAT` | any ACTIVE connection |
| `ROOM_CREATE`, `HOST_RECONNECT` | a `console` that holds no identity |
| `ROOM_JOIN`, `PLAYER_RECONNECT` | a non-console that holds no identity |
| `INPUT_MOVE`, `INPUT_EVENT` | a connection bound to a PLAYER identity |

One connection, one identity. A failed authorization answers `UNAUTHORIZED`, is counted, and does not disconnect. A console that merely *presents* a player's credential neither succeeds nor burns it (tested).

## Bindings, generations and the stale-close race

`BindingTable` records which connection currently speaks for each `(room, player)` and each room's host, with a **generation** stamped on every bind:

```
P1 ← phone A (generation 7)
phone B presents P1's credential → P1 ← phone B (generation 8); A is closed by the server
A's socket reports "closed" LATE → generation 7 is not current → IGNORED (no domain disconnect)
B closes → generation 8 is current → registry.disconnectPlayer(P1)
```

The same protects the host. Tested with the fake transport's *held-back close events*, a chain of three takeovers with every close delayed, duplicate close delivery, and again over a real socket.

## Input semantics

- **Movement is state.** Sequence numbers are scoped to the **connection**: a reconnected controller is a new connection and may restart at 0. `seq <= last accepted` is discarded as normal reordering — counted, never an error, never a disconnect.
- **Actions are events.** Never discarded for "arriving out of order". Deduplicated by `eventId` in a **bounded, per-player** window (default **256** most-recent ids, oldest forgotten first), keyed by player identity so a retry from a *new* connection is still recognised. An event with no host to receive it is **not** remembered, so its retry still gets through. Window memory is bounded per player and pruned with the room.
- The server routes accepted input to the room's host as `PLAYER_INPUT`. It does not simulate.

## Abuse protection (defaults are configurable hypotheses, to be tuned from measurement)

Per connection, each message is classified **before parsing** and charged to a token bucket:

| Class | Burst | Sustained | Why |
| --- | --- | --- | --- |
| movement | 240 | 120/s | a 60 Hz controller uses half; 4 s of Wi-Fi pile-up absorbed |
| action | 60 | 30/s | |
| heartbeat | 10 | 5/s | |
| room operations (create/join/reconnect) | 5 | 1/s | no join spam; answered `RATE_LIMITED` |
| handshake | 3 | 1/s | |
| other / unknown | 20 | 5/s | |

Further bounds: a connection is cut (`RATE_LIMITED`) after **1,000 dropped** messages or **50 invalid** ones; at most **500 concurrent connections**; inbound payloads are capped at **16 KiB** by the transport (an oversized message ends that connection — no reply is sent). Measured: 60 Hz for a minute loses nothing; 100,000 messages in an instant yield exactly the burst.

## Error translation

`room-engine reason → server mapping → protocol ErrorCode → (clients) UI copy`. Each mapping is a `Record` over the domain's failure union, so a new domain failure without a decided report is a compile error.

| Operation | Domain reason → protocol code |
| --- | --- |
| join | `ROOM_NOT_FOUND`→same, `ROOM_NOT_JOINABLE`→same, `INVALID_DISPLAY_NAME`→same, `ROOM_FULL`→same |
| player reconnect | `ROOM_NOT_FOUND`→same, `INVALID_CREDENTIAL`→`INVALID_RECONNECT_TOKEN`, `SEAT_RELEASED`→same, `ROOM_CLOSING`→same |
| host reconnect | `ROOM_NOT_FOUND`→same, `INVALID_CREDENTIAL`→`UNAUTHORIZED`, `ROOM_CLOSING`→same |
| create | `INVALID_CONFIG`, `JOIN_CODE_EXHAUSTED` → `INTERNAL_ERROR` |

An exception inside handling becomes `INTERNAL_ERROR` (no detail), is counted, is passed to `onInternalError`, and never takes down the connection or process.

## Production environment (`createNodeEnvironment`)

Runtime infrastructure the pure packages deliberately lack: UUIDs from `crypto.randomUUID`; credentials = **256 bits** from `crypto.randomBytes`, base64url (requirement: ≥128); join-code candidates drawn with the unbiased `crypto.randomInt` from the unambiguous alphabet (the room engine decides availability); time from `performance.now()` — **monotonic elapsed time, not a calendar timestamp**. Tests check structure (format, length, 100,000-sample uniqueness, alphabet, redaction, non-decreasing time) — not whether output "looks random".

## Controller manifest

Each game definition carries its capacity **and its controller** (`orientation`, `controls`). Definitions are validated against the protocol's manifest schema when the server is created (a game phones could not render fails at startup, not on a phone). A joining or reconnecting controller receives `CONTROLLER_MANIFEST` right after `ROOM_JOINED` / `PLAYER_RECONNECTED`; hosts never do. The platform contains no per-game controller logic.

## Housekeeping and shutdown

- `registry.reconcile()` runs **once per second** (configurable) to make status changes visible to hosts. **Correctness never depends on it**: every operation reconciles its room at the current instant first (tested: a seat that expired at 60,000 ms is free with no sweep having run).
- `start()` binds (port `0` = ephemeral) and schedules the sweep; `stop()` (idempotent): stop accepting connections and cancel handshake timers → cancel the sweep → close the transport. A server starts once. Tests assert zero pending timers and no leaked listening socket after stop.
- Transport: Socket.IO, **WebSocket only** (no long-polling fallback — verified: a polling-only client cannot connect). Server ping 5 s / timeout 5 s.

## Diagnostics

`server.diagnostics()` returns a copy of fixed numeric counters (connections accepted/refused/closed for abuse, handshakes accepted/rejected/timed out, invalid, unauthorized, rate-limited, stale movement, duplicate events, routed movement/events, input with no host, heartbeats, takeovers, stale closes ignored, internal errors). Counters only: no payloads, identities or credentials — so repeated invalid input is observable without exposing anything.

## Test strategy

- **Unit / session-layer** tests use an in-memory `FakeTransport` whose connections can hold back close events, a hand-driven scheduler and clock, and a deterministic environment. They exercise lifecycle, authorization, ordering, dedup, takeover races, limits, translation, shutdown.
- **Real-transport** tests (`integration.test.ts`) start an actual Socket.IO server on an ephemeral port and connect actual Socket.IO clients over WebSocket, with production CSPRNG credentials and only *time* simulated. They cover handshake, rejection before handshake, deadline, room creation, two independent controllers, stale movement, dedup, drop/reconnect with rotation and sequence reset, takeover with stale-close protection, host reclaim, the sweep, flooding, oversized payloads, WebSocket-only, and clean shutdown.

## Unresolved

1. **Liveness.** A silent but connected controller is not detected by our own heartbeat (the server answers heartbeats but does not time out their absence); only Socket.IO's ping (≤ ~10 s) detects a dead transport, which adds to the reconnecting window. Decide an application-level idle timeout together with the controller's heartbeat cadence.
2. **Budgets reset on reconnect** (they are per connection), and there is only a global connection ceiling, no per-address limit. A hostile client can reconnect to refresh its buckets; per-IP / per-identity budgets are later work.
3. **Oversize/flood answers.** An oversized payload closes the connection silently (Socket.IO behavior); no `PAYLOAD_TOO_LARGE` is sent.
4. **Controllers receive no status messages** (only the host gets rosters); the controller's GOOD/UNSTABLE/RECONNECTING indicator needs its own message.
5. **Rooms never close or expire** yet (no close operations are wired; FR-023), so the registry grows. Dedup windows and bindings are pruned with a room, but rooms themselves are not.
6. **Default bind `0.0.0.0`** so phones on a LAN can reach a dev machine. Security rests on credentials, not network position; revisit for production. WebSockets are not CORS-restricted and there is no cookie auth, so cross-site socket opening is not a credential risk.
7. **`onInternalError` receives raw errors.** Domain faults do not contain credentials by construction, but anything logged later must be redacted explicitly.
8. **Optional TLS.** With `FOOMERANG_TLS_CERT` and `FOOMERANG_TLS_KEY` (paths to PEM files; both or neither) the server speaks https/wss. It is needed when the controller page is served over https, because browsers refuse `ws://` from an https page. Tested with a throwaway certificate that the client trusts explicitly — verification is never disabled. The key is read from disk and never logged.
9. **Games.** The server knows two game definitions: `foomerang-fu` (2–6 players) and `primitive-arena` (1–6, the Milestone 1 test arena; one phone is enough to prove the whole flow). Both advertise a single `MOVE` joystick. `MATCH_START` (host only) drives the real room state machine; mid-match joins are refused (`ROOM_NOT_JOINABLE`), reconnects are not.
10. **Development entry point only:** `pnpm --filter @foomerang/server start` (via `tsx`, port 3001, binds `0.0.0.0`). It is a development configuration — public binding widens the attack surface, and credentials are not a substitute for origin/network/TLS controls in production. No build or deployment exists yet.
11. **Movement is not coalesced** on the way to the host (every accepted message is forwarded). Latest-wins coalescing / host-side consumption policy is a measurement question.
