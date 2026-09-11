# Metrics

All metrics are derived client-side from the bots' own connections - no server-side
plugin or RCON needed.

## Server TPS (estimate)

The server sends an `update_time` packet ~every 20 ticks carrying `worldAge`, a
**monotonic server tick counter**. TPS is:

```
TPS ≈ Δ(worldAge) / Δt_real   (clamped to 20)
```

`worldAge` - not `timeOfDay` - because time-of-day freezes under `doDaylightCycle false`
or `/time set`, while worldAge always advances. When the main thread lags, worldAge
advances slower per real second and the drop shows up directly. The estimate is smoothed
(EWMA) and averaged across bots.

**Caveats.** It's a load *trend*, not a precise server-reported number. Proxies
(Velocity/BungeeCord) and forks (Paper/Folia) can relay or alter packet cadence and skew
it. Cross-check against the keep-alive interval (steady ≈15 s; stalls/jitter mean a
blocked main thread).

## Latency

- **Preflight**: clean network RTT from the status ping.
- **In-session**: server-perceived ping, read from the `player_info` packet for the bot's own
  entry, reported as `serverPingMs` (p50/p95/p99). A client can't cleanly self-probe in-play RTT,
  so those two sources are what's used.

## Connection funnel

Per bot, timestamps for: attempt → TCP connect → login (join game) → spawn (in-world).
Reported as time-to-connect and time-to-spawn distributions (p50/p95/p99) and a success
rate (`spawned / attempted`).

## Throughput

Inbound packet count and byte volume (from each packet's wire size), per-second and total.

## Kick / error histogram

Disconnect reasons are bucketed and counted so you can tell an antibot kick from a
"server full" from a timeout at a glance.

## Report

At run end a JSON report is written to `report.dir` with the preflight result and the
full metrics snapshot. Add `--csv` or `--html` for a CSV or self-contained HTML report.
