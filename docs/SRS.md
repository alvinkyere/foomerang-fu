# SRS — Software Requirements Specification

Status: Draft v0.1. Each requirement must be testable. "M" = milestone in which it is first implemented (see ROADMAP).

## Functional requirements
| ID | Requirement | M |
|---|---|---|
| FR-001 | Host can browse available games | 6 |
| FR-002 | Host can launch Foomerang Fu | 5 |
| FR-003 | System creates a unique game room | 1 |
| FR-004 | Lobby displays QR code | 1 |
| FR-005 | Lobby displays short join code | 1 |
| FR-006 | Player can join using QR | 1 |
| FR-007 | Player can alternatively enter room code | 1 |
| FR-008 | Player can choose display name | 1 |
| FR-009 | Server assigns player identity (id + reconnect token) | 1 |
| FR-010 | Player receives a controller interface | 1 |
| FR-011 | Host immediately sees connected player | 1 |
| FR-012 | Multiple players can join simultaneously | 1 |
| FR-013 | Players can mark themselves ready | 2 |
| FR-014 | Host can start the match | 2 |
| FR-015 | Controller sends movement input | 1 |
| FR-016 | Controller sends action input | 3 |
| FR-017 | Game receives inputs in real time | 1 |
| FR-018 | Players can disconnect/reconnect to the same identity | 1 |
| FR-019 | Match can determine winners | 5 |
| FR-020 | Results screen displays outcome | 5 |
| FR-021 | Host can start rematch | 5 |
| FR-022 | Host can return to game library | 6 |
| FR-023 | Room automatically expires | 2 |
| FR-024 | Host can remove a player | 2 |
| FR-025 | Room cannot exceed game capacity | 1 |
| FR-026 | Host refresh/reconnect restores ownership of the existing room | 1 |
| FR-027 | Controller UI is rendered from a game-provided controller manifest | 1 |
| FR-028 | Players see GOOD / UNSTABLE / RECONNECTING connection status; raw ms only in debug | 1 |

## Non-functional requirements
| ID | Requirement | Target |
|---|---|---|
| NFR-001 | Input-to-photon latency (finger movement → visible response; RTT alone is insufficient) | <50 ms excellent, 50–100 good, 100–150 playable, >150 undesirable. Measured, not claimed. |
| NFR-002 | Gameplay frame rate | 60 FPS; game loop independent of React renders and network round trips |
| NFR-003 | Join time (QR scanned, page loaded → usable controller) | <5 s |
| NFR-004 | Reconnect | Character inactive while RECONNECTING (~10 s); seat reserved longer (tunable, start 60 s); same identity retained |
| NFR-005 | Capacity | 2–6 players/room initially |
| NFR-006 | Browsers | Chrome, Safari, Edge, iOS Safari, Chrome Android |
| NFR-007 | Controller responsive across common phone sizes and orientations | — |
| NFR-008 | Reliability: a malformed message never crashes a room or server | — |
| NFR-009 | Accessibility: color is never the sole player identifier | — |
| NFR-010 | Observability: FPS, frame time, RTT, input latency, packet rate, dropped inputs, reconnects exposed in a debug overlay | M1 (RTT), later others |

## Definition of Done
Requirement satisfied + tests passing + strict TypeScript clean + lint clean + relevant E2E passing + error states handled + responsive + accessible where applicable + performance measured + docs updated.
