# Roadmap

Phased so each step ships something usable. Done items land in the [CHANGELOG](../CHANGELOG.md).

## ✅ Phase 1 - core (shipped)

LightBot, ramp scheduler, engine-owned reconnect, authorization gate, config loader,
SLP preflight, connection/TPS/throughput metrics, console live view, JSON report,
real-server integration test, CI/CD.

## ✅ Phase 2 - observability (shipped)

Full-screen TUI dashboard (`--tui`, dependency-free ANSI), CSV + self-contained HTML
report export (`--csv` / `--html`), in-session server-perceived ping via `player_info`.

## ✅ Phase 3 - realism & scale (shipped)

**FullBot** (mineflayer) for realistic game-logic load - selected with `driver: full`;
antiAfk (head rotation) and movement (random walk, chunk loading) behaviors; child-process
sharding (`--shards N`) to get past the single-process ceiling.

_Not yet:_ pathfinder-based navigation and block interaction (basic movement covers chunk
load and no-movement kicks for now).

## ✅ Phase 4 - real-world targets (shipped)

SOCKS5 proxy pool with per-proxy concurrency caps (`proxies.list`), Microsoft account
rotation (`accounts.mode: microsoft`, device-code auth handled by mineflayer/minecraft-protocol),
and named scenarios (`--scenario join-flood | sustained-load | chat-flood | chunk-thrash`).

## ✅ Phase 5 - polish (shipped)

Local web dashboard (`--web`, built-in HTTP + Server-Sent Events, no dependency),
Docker image, `npx mcst`, expanded docs. All five phases are complete.

## Ideas beyond the roadmap

- mineflayer-pathfinder navigation and block interaction.
- HTTP(S) proxy support alongside SOCKS5.
- Historical run comparison / CSV diffing.
