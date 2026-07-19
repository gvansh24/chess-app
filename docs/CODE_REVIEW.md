# Chess-app — Code Review

Reviewed: 2026-07-20. Scope: `backend/`, `frontend/`, `nginx/`, deploy pipeline.
This is your primary software+hardware focus (Phase 2 is a physical smart board),
so this review is deeper than the other two repos and calls out what will bite you
once a real device is on the other end of the socket.

## Architecture (as-is)

```
browser (chess.js authoritative)  ──WS──►  nginx  ──►  backend (ws)  ──stdin/stdout──►  stockfish (1 process / socket)
```

The **client is the source of truth**: the browser runs chess.js, tracks the whole
game, and asks the backend only "given this FEN, what's the engine's move?". The
backend is a thin, stateless Stockfish wrapper. That is fine for solo web play, but
it is the single most important thing to revisit before Phase 2/3, because a physical
board and a motor gantry cannot trust a browser tab to be the referee.

---

## Findings

### 1. UCI command injection via FEN and skill level — `backend/server.js` (Medium)
```js
stockfish.stdin.write(`position fen ${msg.fen}\n`);
stockfish.stdin.write(`setoption name Skill Level value ${msg.level}\n`);
```
`msg.fen` and `msg.level` come straight from the WebSocket client and are written
into the engine's stdin unvalidated. A client can send `fen` containing a newline
(`"8/8/... \ngo infinite\nquit"`) and inject arbitrary UCI commands, or a non-numeric
`level`. Blast radius today is only the engine subprocess, but it's still untrusted
input crossing a process boundary.
- **Fix:** validate FEN against a strict regex (6 space-separated fields, ranks
  `[pnbrqkPNBRQK1-8]`), reject anything with `\n`/`\r`. Clamp `level` to an integer
  0–20. Do the same for `movetime` (positive int, cap it).

### 2. Unbounded engine processes — one `spawn('stockfish')` per socket (Medium)
`wss.on('connection')` spawns a Stockfish process for every connection with no cap.
Open N sockets → N engine processes, each able to `go infinite` and burn a core.
On a 2-vCPU box this is an easy accidental (or hostile) resource exhaustion.
- **Fix:** cap concurrent connections/engines; consider a small pool of reusable
  engine processes keyed to sockets; kill the engine on a `go` if a new `getMove`
  arrives before the previous `bestmove` (stop stale searches). Add a hard cap on
  `movetime`.

### 3. Frontend deps fetched at deploy, not vendored — `frontend/setup-libs.sh` (High, already bit you)
jQuery, chess.js, chessboard.js, and piece PNGs are pulled from CDNs by a script at
deploy time and are `.gitignore`d. When those files are missing the board renders
blank — which is exactly the outage seen on this migration (the libs were never
fetched on the new box). There's no version pinning by hash, no SRI, no fallback.
- **Fix:** vendor the libs into git (they're tiny, ~130 KB total) **or** move the
  frontend to an npm + bundler build so deps are locked in `package-lock.json` and
  fingerprinted. Either way the repo becomes self-contained and a fresh clone just
  works. This single change removes a whole class of "works on my box" failures.

### 4. WebSocket idle timeout (fixed this migration) — `backend/server.js`, infra route (Resolved)
Idle sockets were dropped at nginx's default `proxy_read_timeout` (60 s), so the
engine looked "disconnected" between moves. Fixed two ways: a 30 s server-side
`ws.ping()` heartbeat (cleared on close), and `proxy_read_timeout/send_timeout 3600s`
on the chess WS route. Keep both — the heartbeat also lets you detect half-open
sockets, which matters a lot once a hardware client can silently drop off Wi-Fi.

### 5. No client reconnect — `frontend/game.js` `ws.onclose` (Low)
On close the UI just says "Disconnected from server" and waits for a manual reload.
- **Fix:** exponential-backoff auto-reconnect; on reopen, re-send the current FEN so
  a mid-game drop is invisible. Essential for a flaky-Wi-Fi ESP32 later.

### 6. Old Stockfish from Ubuntu apt — `backend/Dockerfile` (Low)
`ubuntu:22.04` + `apt install stockfish` gives Stockfish 14 (2021). Newer builds are
much stronger and the image is heavy (full Ubuntu + NodeSource curl|bash).
- **Fix:** slim to a `node:22-slim` base, install a current Stockfish binary (or
  build/download a pinned release). Also pin NodeSource — `setup_20.x` is drifting.

### 7. Minor
- `onMouseoutSquare` has a long comment describing a guard that isn't implemented
  (`game.js:332`); it just clears hints. Works, but the comment misleads — trim it.
- `startNewGame` sends `newGame` but relies on the client for reset; fine while the
  client is authoritative, revisit under Phase 2.

---

## Priorities before Phase 2 (hardware)
1. **Make the server authoritative** (or at least validating): the board/gantry must
   trust the server, not a browser. Move legality-checking server-side (a chess lib
   in Node, or trust Stockfish's own legality) so a physical/automated client can't
   desync or cheat the motors into an illegal move.
2. Fix #1 and #2 — a hardware client is untrusted input on an open port.
3. Vendor frontend deps (#3) so field deploys are deterministic.
4. Add reconnect + heartbeat-based liveness (#4, #5) for real-world Wi-Fi.

## What's already good
- Clean separation: thin stateless engine wrapper, static frontend, engine per socket.
- Thoughtful UX in `game.js`: legal-move hints, last-move/check highlighting,
  promotion picker, full end-state detection (mate/stalemate/insufficient/threefold).
- `restart: always` + external `web-gateway` network make it a tidy compose citizen.
- Honest, useful README with a real troubleshooting section and a staged roadmap.
