# Architecture

```
CLI/config ─▶ Engine ─▶ Ramp scheduler ─▶ Driver (LightBot) ─┐
                 │                                             │ typed events
                 ▼                                             ▼
             Registry (specs, backoff)                 MetricsCollector
                                                               │
                                                     Console live view + JSON report
```

## Modules (`src/`)

| Path | Responsibility |
|------|----------------|
| `cli.ts` | Parse flags, load config, run the engine. |
| `config/schema.ts` | Zod schema for the run config — the typed source of truth. |
| `config/load.ts` | Merge file (YAML/JSON) + CLI + legacy `config.json`, validate. |
| `safety/authorization.ts` | Hard consent gate. Refuses to run unauthorized. |
| `net/slp.ts` | Server-list-ping preflight (reachability, version, players, RTT). |
| `engine/engine.ts` | Orchestrator: preflight, spawn, reconnect, shutdown. |
| `engine/ramp.ts` | Pure spawn schedule, jitter, exponential backoff. |
| `engine/registry.ts` | Live bots + retry bookkeeping; owns respawn specs. |
| `drivers/driver.ts` | `BotDriver` interface + typed event map. |
| `drivers/light.ts` | Raw `minecraft-protocol` bot (scale). |
| `behaviors/` | `(bot) => cleanup` behaviors: chat spam, auth. |
| `metrics/` | Collector, sorted-array percentiles, TPS estimator. |
| `report/` | Console live line, JSON export. |

## Why the engine owns reconnection

The old tool had each bot reconnect itself, reading `bot.host`/`bot.port` off the
mineflayer object (which don't exist) via a circular `require` of the entry point.
Here the **Registry holds each bot's full spec**, and the **Engine** — on a bot's
`end`/`kick` event — respawns from that spec with backoff. Drivers only *emit* events;
nothing imports the entry point. One dependency direction, no phantom fields.

## Adding a driver

Implement `BotDriver` (connect/disconnect/chat + emit the `BotEventMap` events). The
planned `FullBot` (mineflayer) will add movement, pathfinding, and chunk loading for
realistic game-logic load behind the same interface, selected by `driver: full`.

## Scaling

`LightBot` skips world/chunk parsing, so one process handles ~1–2k bots. Past that,
shard across **child processes** (one per core) over IPC — protocol crypto and packet
parsing are CPU-bound, so separate event loops beat worker threads. Not yet built;
single-process already far exceeds the old tool.
