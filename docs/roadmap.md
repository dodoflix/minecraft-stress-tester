# Roadmap

Phased so each step ships something usable. Done items land in the [CHANGELOG](../CHANGELOG.md).

## ✅ Phase 1 — core (shipped)

LightBot, ramp scheduler, engine-owned reconnect, authorization gate, config loader,
SLP preflight, connection/TPS/throughput metrics, console live view, JSON report,
real-server integration test, CI/CD.

## Phase 2 — observability

- TUI dashboard (blessed-contrib): live TPS/latency/throughput charts and tables.
- CSV + self-contained HTML report export.
- In-session server-perceived ping via `player_info`.

## Phase 3 — realism & scale

- **FullBot** (mineflayer + pathfinder): movement, chunk loading, block interaction,
  anti-AFK — realistic game-logic load.
- Behavior pack: world-load fly-arounds, randomized movement.
- Child-process sharding over IPC for >2k bots.

## Phase 4 — real-world targets

- SOCKS5/HTTP proxy pool with per-proxy concurrency caps (distribute source IPs).
- Account manager: offline usernames or Microsoft/Xbox auth pool (`prismarine-auth`).
- Named scenarios (join-flood, sustained-load, chunk-thrash, chat-flood).

## Phase 5 — polish

- Optional local web dashboard.
- Docker image, `npx mcst`, expanded docs.
