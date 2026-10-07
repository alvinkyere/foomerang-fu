# ADR-004: Checkpoint C — the Foomerang console session

Status: **Accepted** (2026-10-07, with the decision amendments recorded in §0)
Date: 2026-10-07
Builds on: Checkpoint B slice 1 (`3943a4e`) and slice 2 (`0e88e65`).

## 0. Decisions (accepted 2026-10-07)

| Topic | Decision |
| --- | --- |
| Session creation | **Automatic at Foomerang startup**; reclaimed after a reload |
| Home without a server | Home is local and always works; only the Controllers area depends on the server ("Controllers unavailable — reconnecting") |
| Cleanup of an unestablished / abandoned session | **10 minutes** of host absence (no controller has membership) |
| Host loss in an established session | phones show "TV reconnecting…"; memberships are preserved for the **host recovery window** (proposed 30 min, a tunable hypothesis); only when recovery fails does the session close and every phone end with plain words |
| Console controller capacity | **8** (a console-session limit, never a game's) |
| Fu participant capacity | **2–6** (humans + CPUs; a game-session limit) |
| Default Fu seating | at launch, connected controllers in console join order, up to the available human seats |
| Excess controllers | connected, **WAITING** |
| Seat changes | host-controlled bench / seat; only in the game's lobby or between matches; **never during a running match** (no automatic promotion when someone disconnects) |
| Pause authority | **the TV host and active human participants only**; WAITING / non-participating controllers cannot pause (MENU is not offered to them, and is rejected if sent) |
| Controller identity | persists across games and Home |
| Participant identity | scoped to one game launch (game session); seats and colours are never permanent |
| WAITING | approved: per-controller, semantic; no gameplay actions, no MENU |
| Controller removal | from the TV, confirmed; invalidates membership and reconnect credential at once (RELEASED, permanent) |
| Protocol v2 | C1–C7 strictly additive with the B path intact; `ROOM_*` removed and v2 introduced only when the new path has passed the complete couch / reconnect suite, not merely because C8 was reached |
| Scale | one in-memory server process; no Redis / shared state in C |

Goal: after the TV opens Foomerang, ordinary party operation never needs the computer. A phone joins **Foomerang**, not a Foomerang Fu match, and stays connected while games are launched, played, left and switched.

---

## 1. Current architecture (what the code does today)

```
 TV (console app)                         SERVER                                   PHONE (controller app)
 ───────────────                          ──────                                   ─────────────────────
 Home → Fu → PLAY ──ROOM_CREATE{gameId}──► RoomRegistry.createRoom                  ?room=CODE
                                          Room ─┬─ config {gameId, min, max}  ◄──ROOM_JOIN{code,name}──
 HostSession (one room, one game) ◄ROOM_UPDATED┤ host {hostId, hostToken, conn}  ──ROOM_JOINED{playerId, token}──►
 MatchDirector: humans = seated players       └─ players[] {playerId, name,        ──CONTROLLER_MANIFEST (the room's game)──►
   + CPUs (console only), slots, match           reconnectToken, conn, HELD/RELEASED} ──CONTROLLER_CONTEXT──►
```

What is conflated today:

| Concept | Where it lives now | Problem for C |
| --- | --- | --- |
| Console instance | nowhere (a room per game) | there is nothing to join before a game is chosen |
| Controller identity + reconnect credential | `Room.players[].playerId / reconnectToken` | identity dies with the game's room |
| Game participation (seat 1–6) | the same `Player` record (`HELD` = seated) | joining = playing; a phone cannot be connected without being in Fu |
| Game | `Room.config.gameId`, fixed at creation | switching game = new room = every phone rescans |
| Match / round | console (`MatchDirector`, Fu rules) | fine as is |

Other facts that shape the design:
- Room states `LOBBY → STARTING → PLAYING → RESULTS → LOBBY`, `CLOSING → CLOSED` exist in the domain, but **nothing on the wire closes a room**: "Close Room" on the TV only forgets the credential locally; rooms never expire (docs/SERVER.md, risk 5).
- Connection (`CONNECTED / RECONNECTING / DISCONNECTED`) and membership (`HELD / RELEASED`) are independent, time-reconciled facts (10 s reconnecting window, 60 s seat reservation). Credentials rotate on every reconnect; takeover closes the older transport; a superseded transport's late close is ignored (generation check).
- CPUs, slot colours and the simulation exist **only on the console**; the server never sees them (`minPlayers: 0` for Fu for that reason).
- The shell redirects to the Join screen whenever a room is live, so "Home while connected" does not exist.
- Checkpoint B: `CONTROLLER_CONTEXT` (`CONSOLE | GAMEPLAY | PAUSED | RESULTS`, room-wide `version`), system action `MENU`, phone input → host `InputRouter` → game or the shell's one `FocusManager`.

## 2. Target architecture

```
 TV opens Foomerang
   │  CONSOLE_OPEN                     ┌──────────────── SERVER ────────────────┐
   ▼                                   │ ConsoleSession (aggregate)             │
 ConsoleHostSession ◄─CONSOLE_UPDATED──│  consoleId · joinCode · state          │
   │                                   │  host {hostId, hostToken, connection}  │
   │ GAME_LAUNCH{gameId}               │  controllers[] (membership + creds)    │
   │ GAME_PARTICIPANTS{…}              │  context {value, secondary, version}   │
   │ MATCH_START / MATCH_END           │  activeGame: null | GameSession        │
   │ GAME_EXIT                         │     gameSessionId · gameId · state     │
   ▼                                   │     participants: ControllerId[]       │
 GameRuntime (console-only):           └────────────────────────────────────────┘
   participants (humans + CPUs), slots,           ▲ CONTROLLER_JOIN / RECONNECT
   match, rounds, simulation                      │ INPUT_MOVE / INPUT_EVENT
                                                  │
                                   PHONE ── base console controller at Home,
                                            the game's manifest while a participant,
                                            labels from the context (unchanged from B)
```

Principle: **the server owns membership and routing facts; the console owns play.** The server must know who is connected, who may speak, what game is active and which controllers take part (to send the right manifest and context and to bound capacity). It never learns CPUs, slots, scores or rounds.

## 3. Ownership model

```
Foomerang Console Session   (server aggregate; one TV, one join code)
├── host ownership          hostId + rotating hostToken; exactly one host connection at a time
├── controllers             ControllerId · displayName · rotating reconnectToken
│                           connection (CONNECTED/RECONNECTING/DISCONNECTED) × membership (HELD/RELEASED)
├── controller context      CONSOLE | GAMEPLAY | PAUSED | RESULTS (+ WAITING, per controller; §8), version
└── active game             null | GameSession
      └── Game Session      gameSessionId · gameId · capacity · state · participants (ControllerIds)
            │               (server knows only the HUMAN participants)
            └── on the console only:
                participants incl. CPUs · per-game slots/colours · game config · map
                └── Match   scores, target, champion, rematch
                     └── Round   bodies, boomerangs, timers, round result
```

**CONNECTION ≠ CONTROLLER ≠ PARTICIPANT ≠ GAME ≠ MATCH**

| Term | Is | Is not |
| --- | --- | --- |
| Connection | one transport (socket), with a generation; anonymous until it claims an identity | an identity; it may come and go many times |
| Controller | a phone's membership of a console session (`ControllerId`) | a player; a seat; a colour |
| Participant | a controller (or a CPU) taking part in the **current game session** | permanent; transferable to the next game |
| Game session | one launch of one game (`gameSessionId`) from PLAY until it is exited | a match; the console |
| Match | one race to the target inside a game session (rematch = new match, same game session) | a round |

Answers:

- **What is a console session?** One running Foomerang on one TV: the host credential, the join code, the controllers that belong to it, the current controller context and the active game (if any).
- **What creates it?** The console, with `CONSOLE_OPEN`, automatically when Foomerang starts (§9). A reload reclaims it with the stored host credential (`HOST_RECONNECT`, as today).
- **When does it end?** (a) The TV closes it explicitly (`CONSOLE_CLOSE`, confirmed on the TV); or (b) the host's absence exceeds the applicable limit — new, because console sessions now exist for every open TV and would otherwise accumulate:
  - **unestablished** (no controller holds membership): **10 min** of host absence;
  - **established** (≥ 1 controller holds membership): the **host recovery window** (proposed 30 min). A TV that lost Wi-Fi must not destroy a party; phones meanwhile show "TV reconnecting…".
  A session that becomes unestablished while the host is absent (every phone released) falls back to the 10-min rule measured from the host's disconnect. End = `CLOSING → CLOSED`; every controller is told why and closed; the join code is released.
- **Who owns it?** The host credential holder. Only the host may launch/exit games, set participants, start/end matches, set the context, remove controllers or close the session.
- **What is a controller identity?** `ControllerId`, issued by the server on `CONTROLLER_JOIN`, bound to a rotating reconnect credential kept in the phone's `sessionStorage` (the existing mechanism, re-homed).
- **Does reconnect identity survive game changes?** Yes. It belongs to the console session: launching, exiting, switching games and returning Home never touch it. It ends only when membership is RELEASED (absence beyond the reservation), the TV removes the controller, the phone leaves, or the session closes.
- **What is a player identity?** There is no separate long-lived "player". A **participant** is a per-game-session record: `{ participantId, kind: HUMAN(controllerId) | CPU(cpuId), slot }`. It is created when a game session seats someone and dies with the game session.
- **When does a connected controller become a participant?** When the host includes its `ControllerId` in the game session's participants (`GAME_PARTICIPANTS`). Default policy (§8): on launch, the console seats connected controllers in console join order up to the available human seats; a controller joining while the game is in its lobby is seated if a seat is free; anything else is the host's explicit bench / seat at a boundary.
- **Connected but not participating?** Yes, explicitly: beyond capacity, benched by the host, or joined during a running match (WAITING until the host seats it at a boundary). Such a phone is `WAITING` (§8): no game controls, never pretending they work.
- **Returning Home?** Controller identities, names, credentials and connections are untouched. The game session ends; its participants and slots are discarded; every phone returns to the base console controller with context `CONSOLE`.
- **What does an active game own?** Its definition (capacity, controller manifest), its lifecycle state, its human participants (server) and, on the console: CPUs, slots/colours, game settings, the map, the match.
- **What does a match own?** Scores, target, champion, the waiting list for the next match; rematch makes a new match with the same participants (plus anyone waiting, capacity permitting).
- **What does a round own?** Bodies, positions, boomerangs, pickups, timers, the round result. Unchanged from today.

## 4. State machines

### Console session (server)

```
              CONSOLE_OPEN
                  │
                  ▼
   ┌────────────► OPEN ────────── CONSOLE_CLOSE / host absent > limit* ──► CLOSING ──► CLOSED (terminal; code released)
   │               │
   │   activeGame: none ──GAME_LAUNCH──► GameSession (below) ──GAME_EXIT──► none
   └───────────────┘
```

\* limit = 10 min while unestablished (no controller membership), the host recovery window (30 min proposed) once established.

Deliberately **not** `HOME / GAME_SELECTED / …`: which screen the TV shows (Home, a game's page, Settings) is TV-local UI and never server state. The only server-relevant facts are *open or closing* and *which game session is active, in what state*. "Home" is simply `OPEN` with `activeGame = null`.

### Game session (server, inside OPEN)

```
  none ──GAME_LAUNCH──► LOBBY ──MATCH_START──► STARTING ──► PLAYING ──MATCH_END──► RESULTS ──► LOBBY
                          │                                    │
                          └──────────── GAME_EXIT ─────────────┴──► none   (exit from PLAYING ends the match first)
```

This reuses the existing room transition table for the game (LOBBY/STARTING/PLAYING/RESULTS), which already has 36-pair transition tests. `CLOSING/CLOSED` move up to the console session. Pause and match-over remain **console** facts (the server only sees them as the context `PAUSED` / `RESULTS`, as in B).

### Controller (server; the existing two independent facts, re-homed)

```
 connection:  CONNECTED ──transport lost──► RECONNECTING ──10 s──► DISCONNECTED
                  ▲                              │                     │
                  └──── CONTROLLER_RECONNECT (credential rotates) ─────┘

 membership:  HELD ──absent ≥ 60 s, or CONTROLLER_LEAVE, or removed by TV, or session closed──► RELEASED (terminal)
```

Invariants kept: `CONNECTED ⇒ HELD`, `RELEASED ⇒ DISCONNECTED`, RELEASED is permanent (a returning phone joins again as a **new** controller). Reservation implications:
- While HELD, the controller keeps its participant record and slot in the current game session (a reconnect within 60 s returns to the same body, as today).
- On RELEASED the server removes it from the game session's participants and tells the host; the console treats that participant as having left the match (today's behaviour for a released seat).
- The console's own phone-side phases stay: `IDLE → CONNECTING → JOINING → READY ⇄ RECONNECTING → ENDED`; `ENDED` gains reasons `REMOVED_BY_TV` and `CONSOLE_CLOSED`.

### Controller context (unchanged vocabulary + one per-controller value)

`CONSOLE | GAMEPLAY | PAUSED | RESULTS` keep their B meaning and are console-wide. The host still decides them; the server still restricts non-`CONSOLE` values to a game session in `PLAYING`. Proposed addition, per controller: **`WAITING`** — "the game is being played and you are not in it". It is semantic, not a screen: it tells the phone that its game controls do nothing right now. The server derives it at send time (`GAMEPLAY | PAUSED | RESULTS` + not a participant ⇒ `WAITING`). In `WAITING` the phone has **no gameplay actions and no MENU** (only participants may pause); it says so in consumer words ("Game in progress — you're not playing this round"). No `HOME`, `SETTINGS`, `FU_LOBBY` or similar is ever transmitted.

## 5. Controller manifest model

Three separate things:

| Layer | Owned by | Changes when | Example |
| --- | --- | --- | --- |
| **Physical capability** | the platform (protocol constant, versioned) | never at runtime | one stick, three action buttons (PRIMARY / SECONDARY / TERTIARY), the system MENU button |
| **Control presentation (manifest)** | the base console, or the active game's definition | participation in a game session begins / ends | base: `STICK + PRIMARY + SECONDARY + TERTIARY`; Fu: `MOVE, SLASH(PRIMARY), THROW(SECONDARY), DASH(TERTIARY)` |
| **Meaning now (context)** | the host | every context change | `CONSOLE` ⇒ NAVIGATE / SELECT / BACK; `GAMEPLAY` ⇒ the manifest's own names |

- At Home every phone holds the **base console manifest** (`scope: CONSOLE`, no game id), so it renders the console controller before any game exists.
- A phone receives the game's manifest when it **becomes a participant**, which happens in the game's lobby — *before* START. START therefore stays a single context flip, exactly as in B (no manifest-delivery race at the moment play begins).
- When it stops participating (game exit, removal, bench), it receives the base manifest again.
- Layout stability: the renderer places controls **by generic action**, not by game (B's ControlRenderer already does: PRIMARY biggest, TERTIARY beside SECONDARY). Base and Fu therefore occupy the same physical positions; launching Fu relabels and adds nothing a thumb must hunt for.
- No `if (gameId === 'foomerang-fu')` anywhere in the controller: labels come from `meaningOf(control, context, secondaryAction)` (B, pure, by action), the layout from the manifest.

Transitions the phone sees (no disconnect, no rejoin):

```
Home            base manifest   CONSOLE    NAVIGATE / SELECT / BACK
  ↓ PLAY (Fu)   Fu manifest     CONSOLE    NAVIGATE / SELECT / BACK   (participant now; labels unchanged)
  ↓ START                       GAMEPLAY   MOVE / SLASH / THROW / DASH + PAUSE
  ↓ PAUSE                       PAUSED     NAVIGATE / SELECT / BACK + RESUME
  ↓ match over                  RESULTS    NAVIGATE / SELECT / BACK
  ↓ exit to Home base manifest  CONSOLE    NAVIGATE / SELECT / BACK
```

## 6. Protocol changes (proposed, not implemented)

General: all additions are **additive** to protocol version 1 while both flows coexist (§10); every message is Zod-validated at the server (client → server) and at the client (server → client); credentials appear only in the reply to their owner and are never logged (redacting `Credential` objects, as today); state messages carry `seq` (latest wins, stale dropped); events carry `eventId` (deduplicated per **controller**); authority is enforced in the session/gateway layer (`UNAUTHORIZED` otherwise). At the end of C the legacy `ROOM_*` family is removed and `PROTOCOL_VERSION` becomes 2, so an out-of-date phone tab gets `UNSUPPORTED_PROTOCOL` → "This controller is out of date. Reload the page." (copy that already exists).

### Console (host) ↔ server

| Message | Dir | Payload | Authority / validation | Reconnect / stale behaviour |
| --- | --- | --- | --- | --- |
| `CONSOLE_OPEN` | host→srv, plain | `{}` (strict) | console connection with no identity; rate class `room` | n/a (a reload uses `HOST_RECONNECT`) |
| `CONSOLE_OPENED` | srv→host, plain | `{ joinCode, hostToken }` | only to the opener | the token rotates on every reclaim |
| `HOST_RECONNECT` / `HOST_RECONNECTED` | existing | unchanged shape; resolves the join code to a console session | unchanged | unchanged (rotation, takeover, stale close ignored) |
| `CONSOLE_UPDATED` | srv→host, plain | `{ joinCode, state, hostConnection, controllers[{controllerId, displayName, connection, membership}] (≤ 16), game: null \| { gameSessionId, gameId, state, participants: ControllerId[] } }` | host only; full snapshot | sent on every change and after reclaim; a snapshot, so ordering only needs "latest wins" (TCP order) |
| `GAME_LAUNCH` | host→srv, plain | `{ gameId }` (`[a-z0-9-]`, ≤ 64) | host; game must be known; `activeGame` must be null (`INVALID_STATE`) | answered by `CONSOLE_UPDATED` carrying the new `gameSessionId` (server-generated) |
| `GAME_PARTICIPANTS` | host→srv, **state** (`seq`) | `{ gameSessionId, participants: ControllerId[] }` (unique, ≤ maxPlayers) | host; each id HELD in this console; `gameSessionId` must be current, else ignored (`staleGameDiscarded`); accepted only in `LOBBY` or between matches (context `RESULTS`), otherwise `INVALID_STATE` | latest `seq` wins per host connection; after a host reconnect the console re-sends (B's pattern for context) |
| `MATCH_START` / `MATCH_END` | existing | `{ gameSessionId }` added (optional during coexistence, required in v2) | host; must match the active game session | a start/end aimed at an exited game session is ignored, not applied to the next one |
| `GAME_EXIT` | host→srv, plain | `{ gameSessionId }` | host; must be current | ends a running match first; participants receive the base manifest + `CONSOLE` |
| `CONTROLLER_CONTEXT` | existing (host→srv) | unchanged | unchanged; legality now reads the active game's state | unchanged (`seq`, version) |
| `CONTROLLER_REMOVE` | host→srv, plain | `{ controllerId }` | host; TV-confirmed in the UI | the removed phone gets `CONSOLE_ENDED{reason: REMOVED}` and is closed; credential dead |
| `CONSOLE_CLOSE` | host→srv, plain | `{}` | host | every phone gets `CONSOLE_ENDED{reason: CLOSED}`; code released |

### Phone ↔ server

| Message | Dir | Payload | Authority / validation | Reconnect / stale behaviour |
| --- | --- | --- | --- | --- |
| `CONTROLLER_JOIN` | phone→srv, plain | `{ joinCode, displayName }` | connection with no identity; name rules unchanged; capacity = console `maxControllers` (proposed 8) | — |
| `CONTROLLER_JOINED` | srv→phone | `{ controllerId, reconnectToken }` | only to the joiner | followed by `CONTROLLER_MANIFEST`, `CONTROLLER_PARTICIPATION`, `CONTROLLER_CONTEXT` (in that order; READY only once all have arrived, as B does for context) |
| `CONTROLLER_RECONNECT` / `…RECONNECTED` | phone↔srv | `{ joinCode, reconnectToken }` / `{ controllerId, reconnectToken }` | credential checked first; rotates; takeover closes the older connection | after it: current manifest, participation, context (never a flash of wrong labels) |
| `CONTROLLER_MANIFEST` | existing | gains `scope: CONSOLE \| GAME`; `gameId` only for `GAME` | server-generated from the platform constant / game definition | re-sent on reconnect and when participation changes |
| `CONTROLLER_PARTICIPATION` | srv→phone, plain | `{ gameSessionId \| null, status: NONE \| PARTICIPANT \| WAITING, seatNumber?: 1–16 }`, `version` (shared with the context's version) | server-derived | stale versions ignored, exactly like the context |
| `CONSOLE_STATUS` | srv→phone, plain | `{ hostConnection: CONNECTED \| RECONNECTING \| DISCONNECTED }` | server | sent on change and after (re)join; phone shows "TV reconnecting…" |
| `CONSOLE_ENDED` | srv→phone | `{ reason: CLOSED \| REMOVED \| TV_GONE }` | server | phone → ENDED with words; credential discarded |
| `CONTROLLER_LEAVE` | phone→srv, plain | `{}` | controller | membership RELEASED now (no 60 s wait) |
| `INPUT_MOVE` / `INPUT_EVENT` / `PLAYER_INPUT` | existing | unchanged; `PLAYER_INPUT.playerId` is a `controllerId` in console sessions (renamed `controllerId` in v2) | unchanged, plus: the system `MENU` is routed only from an **active participant** (dropped and counted otherwise); the host enforces the same rule again (defence in depth) | dedup windows keyed by `controllerId`, so they survive game changes |

Terminology: `ROOM_*` is wrong for the new concept (a "room" was one game's lobby). It is **not** renamed in place: the legacy family keeps working unchanged until removal (§10), and the new family uses `CONSOLE_*`, `CONTROLLER_*`, `GAME_*`. The `room-engine` package keeps its name for now (a rename is churn with no behaviour); the consumer UI says "join code", never "room" or "session".

## 7. Server model

```ts
ConsoleSession {
  consoleId: ConsoleId                // branded
  joinCode: JoinCode
  state: 'OPEN' | 'CLOSING' | 'CLOSED'
  host: Host                          // existing: hostId, hostToken (rotating), connection
  controllers: Controller[]           // controllerId, displayName, reconnectToken, joinedAt, connection, membership
  config: { maxControllers: number }
  activeGame: GameSession | null
  createdAt: number
}
GameSession {
  gameSessionId: GameSessionId        // new per launch; guards stale MATCH_*/GAME_* messages
  gameId: string
  capacity: { minPlayers, maxPlayers }
  state: 'LOBBY' | 'STARTING' | 'PLAYING' | 'RESULTS'
  participants: ControllerId[]        // humans only; CPUs never reach the server
}
// application layer (unchanged pattern): bindings (session ↔ host | controller, generation),
// context per console {value, secondaryAction, version}, dedup windows per controllerId.
```

Implementation shape: the connection/membership/credential lifecycle in `room-engine/lifecycle.ts` is extracted into a reusable **member lifecycle** used by both `Room.players` (legacy) and `ConsoleSession.controllers`, so reconnect windows, rotation, takeover and the property-tested invariants are not duplicated. The registry stays the single place where read-modify-write happens synchronously.

Events:

| Event | Result |
| --- | --- |
| Host transport drops | host RECONNECTING → DISCONNECTED; memberships and the game are kept; phones get `CONSOLE_STATUS` ("TV reconnecting…"); the session closes only when the applicable host limit expires (§3), and then every phone gets `CONSOLE_ENDED{TV_GONE}` |
| Host reconnects | `HOST_RECONNECT` (rotation); full `CONSOLE_UPDATED`; the console re-sends context and participants. A *reloaded* page with a game in `PLAYING` has no simulation: it sends `MATCH_END` and shows today's "the match was lost" notice; phones stay |
| Host absent > limit | `CLOSING → CLOSED`; phones `CONSOLE_ENDED{CLOSED}` |
| Controller transport drops | RECONNECTING / DISCONNECTED; still a participant while HELD; host told |
| Controller reconnects | same `controllerId`, same participant and slot; manifest + participation + context re-sent |
| Controller released | removed from participants; host told; the seat stays **empty** for the rest of the running match (no automatic promotion); phone (if it returns) must join again as new |
| Controller removed by the TV | RELEASED at once (credential dead, binding closed, `CONSOLE_ENDED{REMOVED}`); an old credential can never reclaim it |
| Game starts | `LOBBY → STARTING → PLAYING`; context `GAMEPLAY`; non-participants see `WAITING` |
| Match ends | `PLAYING → RESULTS → LOBBY`; context `CONSOLE` |
| Return Home | `GAME_EXIT`: game session discarded; base manifest + `NONE` + `CONSOLE` to its participants |
| Another game | `GAME_LAUNCH` after the exit (Home in between, as the UX has it); participants re-chosen for the new game |
| Session closes | all bindings released, phones told and closed, code released, the aggregate evicted |

The stale-close rule is preserved untouched: only the binding's current generation may disconnect an identity.

## 8. Participation model

```
connected controller (console member, HELD)
        │ host seats it in the active game session (default: auto, in console join order, up to capacity − CPUs)
        ▼
participant (game session)  ──match starts──►  active in the match (has a body)
        │                                            │
        │ joined / seated while a match runs         │ reconnect within 60 s: same participant, same body
        ▼                                            ▼
waiting for the next match (WAITING)          released ⇒ leaves the match (today's behaviour)
```

- **2–6 Fu participants**: humans + CPUs ≤ 6 (the console's existing rule); the server bounds humans ≤ `maxPlayers` and membership.
- **Connected but not playing**: phones beyond capacity, or benched from the lobby by the TV (a seat action, TV-focused like CPU difficulty), are `WAITING`/`NONE`: they still navigate the console when the context is `CONSOLE`.
- **CPUs**: unchanged, console-only; adding a CPU may take the last seat, after which a newly joined phone waits (today's "remove a CPU" message).
- **Late joins**: a phone joining while the game is in its lobby is seated automatically if a human seat is free. Joining during a running match makes it a controller at once, **not** a participant: it is `WAITING`, and enters only when the host seats it at a boundary. (This replaces B's "seated, waits for the next match".)
- **Seat changes** happen only in the lobby or between matches (context `RESULTS`): the host benches / seats. During a running match nothing changes the participant set except a release (the seat then stays empty); there is no automatic promotion of a spectator.
- **Rematch**: same game session and the same participants, plus whoever the host seated at the results screen.
- **Returning Home / switching game**: the game session and all participants end. The next launch seats from scratch, so **slot numbers and colours are per game session**: controller #3 is not "player 3" forever. The phone shows its game seat (`seatNumber`) only while it participates.
- **Reconnect during gameplay**: within HELD the participant and body are kept (B behaviour); after release the match treats them as gone.
- **Pause**: the TV and **active human participants** only. A WAITING or non-participating phone shows no PAUSE and its MENU is rejected by the server and the host. (This narrows B's "any connected controller", which assumed connected = playing.)

## 9. Home experience

- **Home never depends on the server.** Home, game pages and Settings are local and render immediately; the console session is a separate, background concern. If the server is unreachable, Home stays fully navigable (keyboard / gamepad) and only the Controllers area says "Controllers unavailable — reconnecting", retrying on its own.

```
                 FOOMERANG HOME
                       │
          ┌────────────┴────────────┐
     local console              console session
     experience                 (background)
     always works                    │ available?
                                     ├─ yes → QR / code, "Controllers · N"
                                     └─ no  → "Controllers unavailable — reconnecting"
```

- The console session is **created automatically when Foomerang starts** (decided), and reclaimed after a reload. Home always shows a compact status in the system bar: **"Controllers · 3"**. With none connected, Home also shows the QR and code inline ("Scan to use your phone as a controller") so that the first phone needs no keyboard at all.
- Selecting **Controllers** opens a screen with the QR, the join code, the short address to type, and the connected controllers (name, Connected / Reconnecting, seat in the current game if any). Management: **Remove** a controller (confirmed on the TV, starting on Cancel). No networking words anywhere.
- Phones joined at Home drive Home immediately (B's `remote` FocusManager input already exists at the shell root).
- The shell no longer jumps to a lobby just because a session exists: the lobby (Join screen) belongs to an active game.

Lifecycle options:

| Option | For | Against |
| --- | --- | --- |
| **Eager at start (recommended)** | QR is ready the moment the TV is on; zero-keyboard first join; phones can join any time | a server session per open TV (needs the host-absence limit and rate limits); Home must degrade gracefully when the server is unreachable ("Controllers unavailable — retrying") |
| Lazy, on "Controllers" | no server cost until wanted | the very first step needs the keyboard or mouse, which defeats the objective |
| Lazy, on first PLAY | closest to today | phones cannot join at Home: not Checkpoint C |

## 10. Compatibility strategy

- **No flag day.** The new console-session flow is built next to the working B flow. The legacy `ROOM_CREATE / ROOM_JOIN / PLAYER_RECONNECT / ROOM_UPDATED` family keeps its exact behaviour (served by the legacy `Room` aggregate) until the final slice, so every existing server, console, controller and E2E test (incl. the B couch test) stays green while C lands.
- **Additive protocol** during migration (new message types, optional `gameSessionId`, new `scope` on the manifest with a default of `GAME`). Version 2 only when the legacy family is deleted.
- **Join URLs do not change**: `…/controller/?room=CODE` keeps working; the code simply resolves to a console session. (The query name is not consumer-visible; renaming it buys nothing.)
- **Old phone clients** fail safely: during coexistence an old tab joining a console-session code gets `ROOM_NOT_FOUND` ("check the code"); after the version bump, `UNSUPPORTED_PROTOCOL` → "out of date, reload".
- **Tests migrate slice by slice**: each slice adds the new flow's tests; the final slice moves the remaining room-based console/E2E tests onto the console flow and deletes legacy tests together with the legacy code, in one reviewable commit.

## 11. Migration slices (each: own tests, own commit, rollback = revert that commit)

| Slice | Scope | Proves | Leaves working |
| --- | --- | --- | --- |
| **C1 Domain** | room-engine: extract member lifecycle; `ConsoleSession` + `GameSession` aggregates, transition tables, participation rules, host-absence close; registry support; property tests over operation sequences | invariants (CONNECTED ⇒ HELD, participants ⊆ HELD, ≤ capacity, stale game ids rejected) | everything (no wire change) |
| **C2 Protocol** | Zod schemas + types + parse tables for §6 (additive), public-API test | wire validation, hostile inputs | everything |
| **C3 Server: console lifecycle** | `CONSOLE_OPEN`, reclaim, `CONTROLLER_JOIN/RECONNECT/LEAVE`, `CONSOLE_UPDATED`, `CONTROLLER_REMOVE`, `CONSOLE_CLOSE`, absence expiry, bindings + dedup keyed by controller; legacy family untouched | server integration tests incl. stale close, takeover, rotation | B flow end to end |
| **C4 Server: games on a console** | `GAME_LAUNCH/EXIT`, `GAME_PARTICIPANTS`, `MATCH_*` with `gameSessionId`, base/game manifest, `CONTROLLER_PARTICIPATION`, per-controller `WAITING` | game lifecycle without disconnects (server-level) | B flow |
| **C5 Controller** | SDK + app speak the console flow: join at Home, manifest swap without rejoin, WAITING presentation, ENDED reasons | controller unit tests against fakes | B flow (console still legacy) |
| **C6 Console: Home + Controllers** | host session opens the console session at start; "Controllers · N", Controllers screen, inline QR, Remove; phones navigate Home; Join screen no longer forced | shell/app tests; E2E: phone joins at Home and navigates | Fu still launched the legacy way |
| **C7 Console: Fu on the console session** | PLAY → `GAME_LAUNCH`; lobby seats from controllers + CPUs; START / rematch / results; exit to Home keeps phones; switch game | the C acceptance E2E (§12) | — |
| **C8 Hardening + removal** | reconnect variants and the multi-controller test (§12); **only once the new path has passed the complete couch / reconnect suite**: delete the legacy ROOM_* flow and its tests and bump `PROTOCOL_VERSION` to 2 (otherwise C8 ships hardening only and the legacy path stays); docs (PROTOCOL, SERVER, ROOM_ENGINE, CONSOLE, CONTROLLER) | full suite | the console flow only |

## 12. Test strategy and the acceptance test (defined before implementation)

**C acceptance E2E (`integration/e2e/console-couch.e2e.ts`).** It begins at a **fresh Foomerang load** on the TV; from that moment nothing touches the TV's keyboard or mouse:

1. Home shows "Controllers · 0" and an unobtrusive QR/code.
2. Phone A scans the Home QR (opens its link) and joins → "Controllers · 1"; A shows NAVIGATE / SELECT / BACK.
3. A navigates Home, selects Foomerang Fu, activates PLAY.
4. Lobby: A is seated automatically (participant, seat shown on the phone); A adds a CPU; A starts.
5. Gameplay: A shows MOVE / SLASH / THROW / DASH + PAUSE; A pauses, the match freezes; A resumes (the SELECT is not a slash).
6. The match finishes (shortened target); RESULTS; A chooses Rematch; the new match starts.
7. A pauses → Return to Lobby (TV confirm, Cancel first) → confirm; A goes all the way back to Home.
8. **The same phone is still connected**: same `controllerId`, "Controllers · 1", no rescan; A shows the base console controller.
9. A keeps navigating Foomerang (opens Controllers, sees itself, backs out).

**Reconnect variants** (each an E2E or server-integration test as appropriate):

| # | Scenario | Expected |
| --- | --- | --- |
| R1 | Phone drops 3 s at Home | same controller; listed as Reconnecting then Connected; no rejoin UI |
| R2 | Phone reloads in the Fu lobby | same controller, same participant and seat |
| R3 | Phone drops < 10 s mid-match | same body; input resumes |
| R4 | Phone drops 10–60 s mid-match | DISCONNECTED shown; reconnect returns to the same participant |
| R5 | Phone gone > 60 s | membership released; leaves the match; on return it joins as a new controller and is seated by the normal rules (never inherits the old seat) |
| R6 | TV transport drops at Home | phones stay members; TV reclaims; phones keep working without rescanning |
| R7 | TV page reload at Home | same join code; same phones connected |
| R8 | TV page reload mid-match | "match lost" notice, game back to its lobby, phones connected, context CONSOLE |
| R9 | Exit to Home, launch Fu again | same phones seated again; slots re-assigned for the new game session |
| R10 | Second device presents A's credential | takeover: the old one ends with a reason |
| R11 | TV closes the session | every phone ENDED with plain words |
| R12 | Phone joins during a match | WAITING (no working-looking game controls, no PAUSE); not seated until the host seats it at a boundary |
| R13 | Server unreachable at TV startup | Home loads and is navigable; Controllers says "unavailable — reconnecting"; it connects by itself when the server returns |
| R14 | TV gone beyond the recovery window | every phone ends with plain words; nothing waits forever |
| R15 | Removed controller presents its old credential | refused; it must join as a new controller |

**Multi-controller E2E (`integration/e2e/console-eight.e2e.ts`).** 8 phones connected → launch Fu → exactly 6 participants (join order) and 2 WAITING → a waiting phone presses everything (stick, every button, MENU) → **no game effect and no pause** → an active participant disconnects (and, separately, the host benches one between matches) → during the running match **no spectator is promoted** → at the results screen the host deliberately seats a waiting controller → it is a participant in the rematch.

Unit/integration layers: domain property tests (C1), schema tests (C2), server integration over real sockets (C3/C4), controller fakes (C5), console app tests with fake network (C6/C7). The B couch test stays as a regression test until C8 migrates it onto the console flow.

## 13. Performance interaction

C adds no per-frame work. Session and controller state are pushed by the server (`CONSOLE_UPDATED`, participation, context) and read by React through `useSyncExternalStore` subscriptions that fire on change only; nothing is polled per frame; the arena gains no new subscriptions. C does not touch rendering. Noted for the separate performance effort (not part of C): slice 2's per-frame gamepad poll in the arena could run only after a `gamepadconnected` event. The timing-sensitive E2E defect stays open and is not addressed here.

## 14. Risks and open decisions (need a ruling)

Items 1–8 of the original list are decided (§0). Remaining:

1. **Host recovery window** for an established session: 30 min proposed; a product hypothesis to tune from real play, like the other timings.
2. **Abuse surface**: an always-open session per TV means a join code is live longer; current rate limits apply per connection; consider rotating the code from the Controllers screen (later, not C).
3. **Single process**: accepted for C (§0); the registry remains in-memory and single-process (docs/ROOM_ENGINE.md). Shared state is a deliberate later move beyond one server instance.
4. **Physical phone** remains unverified; C's acceptance is automated until a device test is run.
