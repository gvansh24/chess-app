# Chess App

Play chess against Stockfish in a browser today; on a physical sensor-equipped board (Phase 2 hardware) tomorrow. One human, one engine.

## Language

**The Game**:
The single live chess game held by the backend. There is exactly one; every client attaches to it.
_Avoid_: session, room, match, gameId

**Client**:
Anything attached over WebSocket to The Game — the web page or the Board.
_Avoid_: player (the human is the player; clients are devices)

**Board**:
The physical sensor board (Phase 2 hardware). A Client that reports occupancy and displays moves via LEDs.
_Avoid_: device, hardware client

**Occupancy Snapshot**:
The Board's full 64-bit picture of which squares hold a piece, sent whenever any sensor changes.
_Avoid_: bitmap, lift/place events, sensor diff

**Move Inference**:
Server-side mapping of Occupancy Snapshot changes onto the legal-move set of The Game to recover the human's move.
_Avoid_: move detection (firmware detects nothing; it only reports)

## Relationships

- **The Game** has exactly one human side and one engine (Stockfish) side
- Many **Clients** may attach to **The Game** simultaneously; all see the same state

## Example dialogue

> **Dev:** "When the human castles, does the **Board** send a castle event?"
> **Domain expert:** "No — the **Board** only sends **Occupancy Snapshots**. Four snapshots arrive (king lift, king place, rook lift, rook place) and **Move Inference** recognises the castle once the sequence uniquely matches a legal move of **The Game**."

## Flagged ambiguities

- Rooms/gameIds were proposed for the hardware protocol — resolved 2026-07-20: rejected (YAGNI, single user). **The Game** is a singleton.
