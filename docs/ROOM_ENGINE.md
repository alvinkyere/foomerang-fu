# ROOM ENGINE — domain model and invariants

Status: v0.1, written **before** implementation (Slice 3). Authoritative alongside ARCHITECTURE.md. Package: `packages/room-engine` — pure TypeScript, no I/O, no Socket.IO/DOM/Node, time and randomness injected.

## What a session is

A **room** is a Foomerang gaming session: a host, a set of players, a lifecycle state, and a game configuration. It is **not** a connection. Connections come and go; the room, host and players persist.

```
Room
├── roomId        machine identity (opaque, never user-facing)
├── joinCode      temporary human discovery (6 chars); separate from roomId
├── state         LOBBY | STARTING | PLAYING | RESULTS | CLOSING | CLOSED
├── config        { gameId, minPlayers, maxPlayers }   (capacity is configuration, not a platform constant)
├── host          { hostId, hostToken }
├── players[]     { playerId, displayName, reconnectToken, connectionStatus, joinedAt }
└── createdAt
```

**The domain holds no transport connection ids.** Host ≠ WebSocket and Player ≠ WebSocket is enforced structurally: the server's session layer maps `connection → (roomId, playerId | host)`; the room never references a socket.

## Identity types (opaque)

`RoomId`, `PlayerId`, `HostId`, `JoinCode` are **branded strings**: they serialize as strings but are not interchangeable in the type system (`reconnect(roomId, playerId)` argument mix-ups fail to compile; verified by `@ts-expect-error` tests).

`ReconnectToken` and `HostToken` are **credentials**. They are opaque `Credential` objects (not branded strings) that:

- redact themselves in `toString()`, `JSON.stringify`, template literals and `util.inspect` (`[REDACTED]`), so a room or player object logged by accident does not leak them;
- expose their value only through an explicit, greppable `reveal()` — called at exactly the sites that must deliver the credential to its owner;
- compare candidates in constant time.

> **Security rule.** Authentication/reconnection credentials must not appear in routine logs, analytics, error messages, or consumer-facing state. Domain failure results never contain them. If structured logging is introduced, redaction is explicit and tested.

## Injected environment

Pure code cannot call `Date.now`, `Math.random` or `crypto`. Everything nondeterministic arrives through `RoomEnvironment`:

```
now()                       clock
newRoomId() newPlayerId() newHostId()
newReconnectToken() newHostToken()
nextJoinCodeCandidate()     returns a candidate string; room-engine decides availability
```

Production implementations (CSPRNG-backed, ≥128-bit tokens) live in the server (Slice 6); tests use deterministic fakes. A generator that returns an already-used id is a programming/system fault → **throws** (and nothing is mutated).

## Results, not exceptions

Expected outcomes are values: `{ ok: true, value } | { ok: false, reason }`. Exceptions are reserved for programming/system faults (e.g. duplicate ids from a broken generator). Reasons are domain vocabulary; the server translates them to protocol `ErrorCode`s (e.g. `ROOM_FULL` → `ROOM_FULL`).

| Operation | Failure reasons |
| --- | --- |
| create room | `INVALID_CONFIG`, `JOIN_CODE_EXHAUSTED` |
| join | `ROOM_NOT_FOUND` (registry), `ROOM_NOT_JOINABLE`, `INVALID_DISPLAY_NAME`, `ROOM_FULL` |
| transition | `ROOM_NOT_FOUND` (registry), `INVALID_TRANSITION`, `NOT_ENOUGH_PLAYERS` |

Join checks run in this order: joinable state → display name → capacity.

## Immutability and atomicity

`Room` values are **immutable** (readonly types and `Object.freeze`). Every operation is a function from an old room to a new room or a failure. A failed operation therefore cannot partially mutate state — the old value is untouched by construction (a failed result carries no new room, and tests assert reference equality of the unchanged room and non-consumption of generated ids).

State changes only through named domain operations — never `room.state = ...`.

## State machine

`CREATING` from the earlier sketch is **not** a state: room creation is atomic (join code allocated before a room value exists), so a half-created room is never observable. _(Deviation, flagged for review.)_

| from \ to | LOBBY | STARTING | PLAYING | RESULTS | CLOSING | CLOSED |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| **LOBBY** | – | ✔ `beginStart` | – | – | ✔ `closeRoom` | – |
| **STARTING** | – | – | ✔ `startPlaying` | – | ✔ `closeRoom` | – |
| **PLAYING** | – | – | – | ✔ `finishGame` | ✔ `closeRoom` | – |
| **RESULTS** | ✔ `returnToLobby` | – | – | – | ✔ `closeRoom` | – |
| **CLOSING** | – | – | – | – | – | ✔ `completeClose` |
| **CLOSED** | – | – | – | – | – | – |

Every one of the 36 (from,to) pairs is tested: the 10 permitted succeed, the other 26 fail with `INVALID_TRANSITION` and leave the room unchanged. `CLOSED` is terminal: a closed room cannot reopen. Cancelling a start (STARTING → LOBBY) is deliberately absent until a requirement exists. `beginStart` additionally requires `minPlayers`.

## Operations (public via `RoomRegistry`)

`createRoom(config)`, `joinRoom(roomId, displayName)`, `beginStart`, `startPlaying`, `finishGame`, `returnToLobby`, `closeRoom`, `completeClose`, plus lookups (`getRoom`, `findByJoinCode`) and credential identification (`identifyPlayer(roomId, token)`, `isHost(roomId, token)`).

Reconnect / disconnect behavior is Slice 4.

## RoomRegistry

The registry owns the set of live rooms in a process and the join-code index, and encapsulates every read-modify-write so no other layer performs one. Join-code allocation:

- candidates come from the injected generator; an invalid candidate or an in-use code is a failed attempt;
- attempts are **bounded** (`MAX_JOIN_CODE_ATTEMPTS`, default 10, configurable); exhaustion returns `JOIN_CODE_EXHAUSTED` — never an unbounded loop;
- codes are released when a room reaches `CLOSED`; the closed room is then evicted (bounded memory) and lookups return not-found.

## Joinability and display names

Players may join only in `LOBBY` (late-join policy is a later product decision). Display names: trimmed, 1–16 Unicode code points, no control/format/line-separator characters (blocks bidi-override spoofing on the shared screen). Duplicate names are allowed for now. Profanity/emoji/moderation policy is deferred.

## Concurrency (future, documented not built)

Two joins racing for the last seat must yield 6/6, never 7/6. In a single Node process each registry operation is synchronous, so check-and-add is atomic provided **no `await` ever sits between reading a room and writing it back** — which is why the registry, not callers, performs read-modify-write. When rooms move beyond one process (sharding, persistence, multiple servers) this becomes a distributed-coordination requirement (single-writer-per-room or compare-and-set on a room version). Not built in this slice.
