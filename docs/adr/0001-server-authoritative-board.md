# Server-authoritative game state; Board is a dumb peripheral

The Phase-2 physical Board could hold chess rules in firmware (play offline) or stream raw sensor data to the backend which owns all chess logic. We chose server-authoritative: the backend holds The Game in chess.js (already the project's rules library), performs move inference from occupancy data, and broadcasts state to all Clients. Firmware only scans sensors and drives LEDs.

Why: Stockfish can't run on an ESP32, so the server is required for play regardless — offline firmware rules buy nothing. Reusing chess.js server-side avoids a second rules implementation in C++, and the web UI mirrors the physical game for free.

Consequences: Board is unusable when the server is unreachable; firmware stays trivial (scan + LEDs + WebSocket).
