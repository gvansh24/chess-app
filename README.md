# Chess vs Stockfish

Self-hosted chess web app. Frontend talks to a Node WebSocket server that wraps a Stockfish process; nginx serves the static frontend and proxies `/ws` to the backend.

```
browser  ──HTTP/WS──►  nginx :80  ──/ws──►  backend :3000  ──stdin/stdout──►  stockfish
```

## Layout

```
backend/                Node + ws + Stockfish bridge
  server.js
  package.json
  Dockerfile
frontend/               Static files served by nginx
  index.html
  game.js
  style.css
  setup-libs.sh         Downloads JS libs and piece PNGs (NOT in git)
nginx/default.conf      Reverse proxy + WebSocket upgrade
docker-compose.yml      Two services: backend + nginx
```

## First-time deploy (Oracle Cloud / any Linux VM with Docker)

```bash
git clone https://github.com/gvansh24/chess-app.git
cd chess-app

# 1. Download frontend dependencies (NOT in git — fetched per VM)
bash frontend/setup-libs.sh

# 2. Build & start
docker compose up -d --build

# 3. Verify
docker compose ps                  # both services Up
curl -I http://localhost           # 200 from nginx
```

Open `http://<your-public-ip>` in a browser. Status should go from `Connecting…` to `Your turn` within ~1 s.

## Updating

```bash
git pull
# Frontend changes:  no restart needed (nginx serves ./frontend as a live volume)
# Backend changes:   docker compose up -d --build backend
```

## Troubleshooting

- **Blank board**: check `ls -lh frontend/*.min.* frontend/img/chesspieces/` — files must be real (KB-sized), not 45-byte error stubs. Re-run `bash frontend/setup-libs.sh`.
- **Status stuck on "Connecting…"**: check `docker compose logs backend` for Stockfish errors. `docker compose exec backend which stockfish` should print a path.
- **Page doesn't load at all**: Oracle Cloud has both VCN Security Groups AND OS-level iptables. Both must allow port 80 inbound.

## Roadmap

- **Phase 1 (current)**: web vs Stockfish.
- **Phase 2**: DIY physical smart chessboard (ESP32 + reed switches + WS2812 LEDs) connecting via WebSocket. Routes between web ↔ board ↔ Stockfish ↔ lichess Board API.
- **Phase 3**: stepper-motor XY gantry under the board to physically move opponent pieces.
- **Phase 4**: scale (process pool for engine, Redis-backed sessions, k8s).
