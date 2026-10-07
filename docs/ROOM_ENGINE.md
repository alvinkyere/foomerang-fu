# ROOM ENGINE — domain model and invariants

Status: v0.2 (Slice 4 adds connection/seat lifecycle and credential rotation; originally written before implementation in Slice 3). Authoritative alongside ARCHITECTURE.md. Package: `packages/room-engine` — pure TypeScript, no I/O, no Socket.IO/DOM/Node, time and randomness injected.

## What a session is

A **room** is a Foomerang gaming session: a host, a set of players, a lifecycle state, and a game configuration. It is **not** a connection. Connections come and go; the room, host and players persist.

```
Room
├── roomId        machine identity (opaque, never user-facing)
├── joinCode      temporary human discovery (6 chars); separate from roomId
├── state         LOBBY | STARTING | PLAYING | RESULTS | CLOSING | CLOSED
├── config        { gameId, minPlayers, maxPlayers }   (capacity is configuration, not a platform constant)
├── host
│   ├── identity     hostId, hostToken (rotates)
│   └── connection   status (+ disconnectedAt)            — no seat, no membership
├── players[]        (every participant who ever joined; former seat-holders stay as history)
│   ├── identity     playerId, displayName, reconnectToken (rotates), joinedAt
│   ├── connection   status (+ disconnectedAt)            — can we communicate with this controller?
│   └── membership   HELD | RELEASED (+ releasedAt)       — does this player still own a seat?
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
| player disconnect | `ROOM_NOT_FOUND`, `PLAYER_NOT_FOUND`, `ALREADY_DISCONNECTED` |
| player reconnect | `ROOM_NOT_FOUND`, `INVALID_CREDENTIAL`, `SEAT_RELEASED`, `ROOM_CLOSING` |
| host disconnect | `ROOM_NOT_FOUND`, `ALREADY_DISCONNECTED` |
| host reconnect | `ROOM_NOT_FOUND`, `INVALID_CREDENTIAL`, `ROOM_CLOSING` |

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

Every one of the 36 (from,to) pairs is tested: the 9 permitted succeed, the other 27 fail with `INVALID_TRANSITION` and leave the room unchanged. `CLOSED` is terminal: a closed room cannot reopen. Cancelling a start (STARTING → LOBBY) is deliberately absent until a requirement exists. `beginStart` additionally requires `minPlayers`.

## Operations (public via `RoomRegistry`)

Room: `createRoom(config)`, `joinRoom(roomId, displayName)`, `joinByCode(joinCode, displayName)`, `beginStart`, `startPlaying`, `finishGame`, `returnToLobby`, `closeRoom`, `completeClose` (each by `roomId`).
Lifecycle: `disconnectPlayer(roomId, playerId)`, `reconnectPlayer(roomId, token)`, `disconnectHost(roomId)`, `reconnectHost(roomId, token)`, `reconcile()` (the sweep).
Reads: `getRoom(roomId)`, `findByJoinCode(input)`, `size`, `identifyPlayer(roomId, token)`, `isHost(roomId, token)`; helpers `occupiedSeats(room)`, `seatedPlayers(room)`.

The raw pure operations (`joinRoom(room, …)`, `reconcile(room, …)`, …) are **internal to the package** and tested directly; only the registry is public, so no caller can perform its own read-modify-write.

## Connection and seat lifecycle (Slice 4)

**Connection and membership are two independent facts, not one combined state.** Combined states such as `DISCONNECTED_RESERVED` would be combinatorial garbage; instead:

```
connection:  CONNECTED ──drop──► RECONNECTING ──window ends──► DISCONNECTED
membership:  HELD ─────────────────────────────seat reservation ends──────► RELEASED   (permanent)
```

Timeline after a drop at `t = 0` (defaults; both are **configurable hypotheses**, `reconnectingWindowMs` / `seatReservationMs`, to be tuned from real play):

| elapsed | connection | membership | occupies capacity |
| --- | --- | --- | :-: |
| `< 10 s` | RECONNECTING | HELD | yes |
| `≥ 10 s` and `< 60 s` | DISCONNECTED | HELD | yes |
| `≥ 60 s` | DISCONNECTED | RELEASED | no |

Invariants, verified over randomized operation sequences: **CONNECTED ⇒ HELD**; **RELEASED ⇒ DISCONNECTED**; RELEASED is permanent; occupancy never exceeds `maxPlayers`; identities never change; every credential is unique.

### Timing semantics
- **Inclusive boundary:** a period ends when `elapsed >= duration`. At exactly 10,000 ms the reconnecting window has ended; at exactly 60,000 ms the seat is released. Tested at 9,999 / 10,000 / 10,001 and 59,999 / 60,000 / 60,001 ms, plus custom and coincident durations.
- **No timers.** The engine never schedules anything and never reads a platform clock. Statuses are a pure function of recorded facts (`disconnectedAt`) and an injected `now`. `reconcile(now)` brings them up to date; the **server decides when to ask**.
- **Correctness does not depend on sweep cadence.** Every registry operation reads the clock once, reconciles the target room to that instant, then operates. A join at exactly 60,000 ms sees the seat free without any sweep having run. The sweep (`reconcile()`) only makes changes visible sooner, and returns the rooms that changed.
- **`releasedAt` is logical** (`disconnectedAt + seatReservationMs`), not the moment the server noticed, so late reconciliation produces the same state as prompt reconciliation.
- **Monotonic-clock contract.** `RoomEnvironment.now()` must be non-decreasing and measures *elapsed time*, not calendar time (wall clocks jump with NTP/DST/manual changes, which would wrongly release or pin seats). The production implementation should use a monotonic source. A reading earlier than a previous one (or NaN) violates the contract and **throws before anything changes**; it never produces negative elapsed time or a corrupted room.
- A repeated drop notification does **not** restart the clock (that would silently extend the seat hold).

### Capacity — one canonical definition
`occupiedSeats(room)` is the only definition of occupancy: **a seat is occupied while the player's membership is HELD, whether CONNECTED, RECONNECTING or DISCONNECTED.** Released seats free capacity immediately and a newcomer takes a *new* identity. Starting a match additionally requires `minPlayers` seat-holders who are currently CONNECTED (a ghost cannot play) — _policy, flagged below_.

### Reconnection
- **Same identity, always.** `PlayerId`/`HostId`, name, join time and position never change; reconnection never creates a participant.
- **Single-use credentials.** A successful reconnect issues a **new** credential and the one just used stops authenticating (an old captured credential is worthless). A failed attempt rotates nothing and the genuine credential is unharmed.
- **Takeover.** A valid credential presented while the player is still CONNECTED wins, and the result reports `replacedActiveConnection: true`. Invariant: one `PlayerId` ↔ at most one active controller. The domain models no sockets, so the **server transport layer must** drop the stale transport on takeover **and ignore that transport's late close event** (which would otherwise mark the freshly reconnected player as disconnected).
- A released seat cannot be reclaimed through the reconnect path (`SEAT_RELEASED`; the player must join as a new participant, if the room still admits it). Credential is checked before room state is revealed.
- Reconnect is refused for a closing room (`ROOM_CLOSING`).

### Seat release is not erasure
Releasing a seat flips `membership` to RELEASED; the participant stays in `room.players`. Seat lifecycle and historical-participant lifecycle are different concerns: future results/history can still name a player who disconnected. How long released participants are retained (and a bound on that growth) is a later concern; server-side join-rate limiting limits abuse meanwhile.

### Host
The host holds no seat. Host loss **never** closes the room, releases a seat, migrates or elects a host, or touches any player. Only the host's `connection` status progresses (RECONNECTING → DISCONNECTED, same inclusive window) and the host reconnects by credential to the same `HostId`, rotating the host credential. Players' clocks and the host's clock are independent.

## Unresolved policies (deliberately not decided)
1. **What host loss means for a running match.** (_Policy now decided — see docs/CONSOLE.md, "Host-loss policy"; the expiry duration remains a measured hypothesis._) In Milestone 1 the simulation runs in the host browser, so *host lost ⇒ simulation lost*. Pause, recover, or restart the round? Server-authoritative simulation changes the answer. Also: should a host that stays gone eventually close the room (and when)? Product decision pending.
2. **Whether match start should count reserved-but-disconnected players.** Currently only CONNECTED seat-holders count toward `minPlayers`.
3. **Late-join / mid-match join** (currently LOBBY only) and whether a released player may re-enter mid-match.
4. **Retention of released participants** (history bound).
5. **Seat numbering.** There is no seat *index* (e.g. for player colors); "same seat" currently means same membership and same position in `room.players`. Slot numbering is introduced when a requirement needs it.
6. Final default durations (10 s / 60 s are hypotheses).

## RoomRegistry

The registry owns the set of live rooms in a process and the join-code index, and encapsulates every read-modify-write so no other layer performs one. Join-code allocation:

- candidates come from the injected generator; an invalid candidate or an in-use code is a failed attempt;
- attempts are **bounded** (`MAX_JOIN_CODE_ATTEMPTS`, default 10, configurable); exhaustion returns `JOIN_CODE_EXHAUSTED` — never an unbounded loop;
- codes are released when a room reaches `CLOSED`; the closed room is then evicted (bounded memory) and lookups return not-found.

## Joinability and display names

Players may join in `LOBBY`, and (Slice 8) in `PLAYING`: a late arrival holds a seat but the game decides what that means (Foomerang Fu: they wait for the next match; no body is created mid-match). Every other state refuses with `ROOM_NOT_JOINABLE`. `minPlayers` may be 0: a game whose other participants are software can start with nobody on a phone. Display names: trimmed, 1–16 Unicode code points, no control/format/line-separator characters (blocks bidi-override spoofing on the shared screen). Duplicate names are allowed for now. Profanity/emoji/moderation policy is deferred.

## Console sessions (Checkpoint C, ADR-004)

A **console session** is one Foomerang on one TV, joined before any game is chosen. It lives beside the legacy room (both coexist until the console flow replaces it) and is mutated only through `ConsoleRegistry`, with the same discipline as `RoomRegistry` (one clock read per operation, reconcile, apply, commit on success only).

```
ConsoleSession   OPEN → CLOSING → CLOSED         (host: hostId, rotating hostToken, connection)
├── controllers  Controller: controllerId, name, rotating reconnectToken, connection × membership, releaseReason
├── context      CONSOLE | GAMEPLAY | PAUSED | RESULTS, secondaryAction, version (changes only on a real change)
└── activeGame   null | GameSession: gameSessionId, config, LOBBY → STARTING → PLAYING → RESULTS → LOBBY,
                 participants (human ControllerIds, seat order)
```

- **Controller ≠ participant.** Joining makes a controller (≤ 8 per console), never a participant. A launch seats connected controllers (a briefly reconnecting one counts) in join order up to the game's `maxPlayers`; everybody else is WAITING. Exiting the game ends every seat; controllers stay. Messages for an exited launch fail `STALE_GAME` and change nothing.
- **Seat changes** (`setParticipants`) only in `LOBBY` or between matches (context `RESULTS`); never while a match runs or is paused. A participant whose membership ends leaves an empty seat; nobody is promoted.
- **Effective context / pause:** a non-participant during `GAMEPLAY | PAUSED | RESULTS` is `WAITING`; only an active participant may pause (or resume) while the match runs (`mayPause`).
- **Release** (left, removed by the TV, absent past the reservation, console closed) is permanent; a RELEASED member's connection is terminally DISCONNECTED; an old credential never reclaims it.
- **TV absence:** the session closes (`TV_GONE`) after `unestablishedHostMs` (10 min) while no controller holds membership, or after `hostRecoveryMs` (30 min, a hypothesis) once a party exists, measured from the TV's disconnect.
- **Join codes** come from one `JoinCodeSpace` shared with the legacy registry, so a code never means both a room and a console.
- The connection / membership lifecycle (`member.ts`) is shared by room players and console controllers.

## Concurrency (future, documented not built)

Two joins racing for the last seat must yield 6/6, never 7/6. In a single Node process each registry operation is synchronous, so check-and-add is atomic provided **no `await` ever sits between reading a room and writing it back** — which is why the registry, not callers, performs read-modify-write. When rooms move beyond one process (sharding, persistence, multiple servers) this becomes a distributed-coordination requirement (single-writer-per-room or compare-and-set on a room version). Not built in this slice.
