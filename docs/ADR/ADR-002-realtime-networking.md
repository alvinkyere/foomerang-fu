# ADR-002: Initial realtime networking — Node + Socket.IO behind a transport abstraction

Status: Accepted (review v0.2)
Date: 2026-10-05

## Context
Phones send frequent small inputs to a server that routes them to a host display. Needs: rooms, reconnection, low latency, easy testing. Scale is tiny (≤6 players/room). The risk is feel, not throughput.

## Options
1. **Socket.IO** — rooms, acks, reconnect, mature tooling; framing overhead; its reconnect restores transport, not game identity.
2. **Raw `ws`** — lean, full control, more to build.
3. **WebRTC DataChannel / WebTransport** — potentially better for unreliable inputs; much more complexity.

## Decision
Socket.IO with **WebSocket-only transport** for M1, hidden behind `ControllerTransport` / `HostTransport` interfaces. Game and UI code never call `socket.emit`. We do **not** pre-commit to any fallback: measure first, and only evaluate alternatives if data shows a problem. Domain logic lives in pure `room-engine`; the server is a thin adapter. Our own `reconnectToken` layer is required regardless of library.

## Consequences
+ Quick spike; transport swap isolated to one implementation.
− Possible TCP head-of-line blocking under packet loss; mitigated by latest-wins movement; revisit with M1 measurements.
