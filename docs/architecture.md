# Architecture

```
CLI/config ─▶ Engine ─▶ Ramp scheduler ─▶ Driver (LightBot / FullBot) ─┐
                 │                                                       │ typed events
                 ▼                                                       ▼
       Registry (specs, backoff)                                 MetricsCollector
       ProxyPool + AccountManager                                        │
                                                     Live view (console / TUI / web) + reports
```

For runs above the single-process ceiling, an orchestrator forks N worker processes,
each a full Engine on a slice of the bot budget, and merges their snapshots.

## Modules (`src/`)

| Path | Responsibility |
|------|----------------|
| `cli.ts` | Parse flags, load config, run the engine (or a shard, or the sharded orchestrator). |
| `config/schema.ts` | Zod schema for the run config - the typed source of truth. |
| `config/load.ts` | Merge scenario + file (YAML/JSON) + CLI overrides, validate. |
| `config/scenarios.ts` | Named load profiles (join-flood, sustained-load, chat-flood, chunk-thrash). |
| `safety/authorization.ts` | Hard consent gate. Refuses to run unauthorized. |
| `net/slp.ts` | Server-list-ping preflight (reachability, version, players, RTT). |
| `net/proxy.ts` | SOCKS5 proxy pool (round-robin + per-proxy caps) and proxy URL parsing. |
| `net/socksConnect.ts` | Tunnels a bot's game socket through a SOCKS5 proxy. |
| `net/accounts.ts` | Offline username generation or Microsoft account rotation. |
| `engine/engine.ts` | Orchestrator: preflight, spawn, reconnect, shutdown, reporter selection. |
| `engine/ramp.ts` | Pure spawn schedule, jitter, exponential backoff. |
| `engine/registry.ts` | Live bots + retry bookkeeping; owns respawn specs. |
| `engine/shard.ts` | Pure budget split + snapshot merge for sharding. |
| `engine/sharded.ts` | Forks worker processes and aggregates their snapshots. |
| `drivers/driver.ts` | `BotDriver` interface + typed event map. |
| `drivers/light.ts` | Raw `minecraft-protocol` bot (scale). |
| `drivers/full.ts` | mineflayer bot (realistic movement / chunk loading). |
| `behaviors/` | `(bot) => cleanup` behaviors: auth, chatSpam, antiAfk, movement. |
| `metrics/` | Collector, sorted-array percentiles, TPS estimator. |
| `report/` | Console line, TUI dashboard, web (HTTP + SSE) dashboard, JSON/CSV/HTML export, summary. |

## Why the engine owns reconnection

The old tool had each bot reconnect itself, reading `bot.host`/`bot.port` off the
mineflayer object (which don't exist) via a circular `require` of the entry point.
Here the **Registry holds each bot's full spec**, and the **Engine** - on a bot's
`end`/`kick` event - respawns from that spec with backoff. Drivers only *emit* events;
nothing imports the entry point. One dependency direction, no phantom fields.

## Drivers

Both drivers implement `BotDriver` (connect/disconnect/chat + emit the `BotEventMap`
events), with optional `look`/`setControlState` for movement:

- **LightBot** (`minecraft-protocol`): no world parsing, ~1-2k bots per process. For scale
  and connection-path load.
- **FullBot** (mineflayer): parses the world, so it can move and load chunks (~tens to low
  hundreds per process). For realistic game-logic load. Selected with `driver: full`.

A custom driver can be injected via the engine's `driverFactory` option. (Pathfinder-based
navigation and block interaction are not implemented yet; basic movement covers chunk load.)

## Scaling

`LightBot` skips world/chunk parsing, so one process handles ~1-2k bots. Past that,
`--shards N` fans the run out across N worker processes (one Engine each, over `child_process`
IPC) - protocol crypto and packet parsing are CPU-bound, so separate event loops beat worker
threads. `engine/shard.ts` splits the budget and merges the per-shard snapshots.
