# Minecraft Stress Tester

[![CI](https://github.com/dodoflix/minecraft-stress-tester/actions/workflows/ci.yml/badge.svg)](https://github.com/dodoflix/minecraft-stress-tester/actions/workflows/ci.yml)
[![coverage ≥95%](https://img.shields.io/badge/coverage-%E2%89%A595%25-brightgreen.svg)](.github/workflows/ci.yml)
[![release](https://img.shields.io/github/v/release/dodoflix/minecraft-stress-tester?label=release)](https://github.com/dodoflix/minecraft-stress-tester/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)

A detailed, open-source load tester for Minecraft servers. It connects a controllable
swarm of bots and **measures what the load does to the server** - estimated TPS, the
connection funnel, latency, throughput, and kick reasons - instead of just opening
sockets.

> [!WARNING]
> This is a load generator. Run it **only** against servers you own or have explicit
> written permission to test - anything else is a denial-of-service attack. The tool
> refuses to start until you affirm authorization. See [SECURITY.md](SECURITY.md).

## Features

- **Server-impact metrics** - TPS estimate (from the `worldAge` tick counter), connection
  funnel with p50/p95/p99, success rate, packet/byte throughput, kick-reason histogram.
- **Two drivers** - **LightBot** on raw `minecraft-protocol` (~1-2k bots/process) for scale,
  and **FullBot** on mineflayer (`--driver full`) for realistic movement + chunk loading.
  Scale further across processes with `--shards N`.
- **Ramp control** - connections/sec with ramp-up, hold, jitter, and exponential-backoff
  reconnect.
- **Real-server ready** - SOCKS5/HTTP proxy pool (`proxies.list`, or `proxies.auto` to fetch
  and validate free public proxies), to spread source IPs, Microsoft
  account rotation (`accounts.mode: microsoft`), and named scenarios (`--scenario join-flood`).
- **Authorization gate** - no run without explicit consent.
- **Observability** - server-perceived ping (from `player_info`), a full-screen TUI (`--tui`)
  or local web (`--web`) live dashboard, and JSON / CSV / HTML run reports.
- **Preflight ping**, YAML/JSON config, CLI.
- **Real-server tested** - the integration suite downloads and boots the newest supported
  Paper build and runs actual bots against it.

The v1 CLI is complete; the [roadmap](docs/roadmap.md) covers v2 - a UI, scripting, a debug
console, automatic free proxies, and a defensive security scanner.

## Quickstart

```bash
git clone https://github.com/dodoflix/minecraft-stress-tester.git
cd minecraft-stress-tester
npm install
npm start -- --config examples/local.yaml
```

Or from flags:

```bash
npm start -- --host 127.0.0.1 --port 25565 --count 100 --i-am-authorized
```

## Sample output

```
Preflight ping 127.0.0.1:25565 ...
  Paper 26.1.2 (protocol 774) | players 0/200 | ping 1ms | "mcst-real-test"
Spawning 100 bots (driver=light), run ~70s
t=5s  active=100  spawned=100/100(100%)  tps~20.0  connect_p95=48ms  in=1900pkt/s 41.2KB/s  kick=0 err=0
...
=== Run summary ===
spawned:         100 (100.0% of attempts)
est. server TPS: 19.8
time-to-connect: p50=19ms p95=48ms p99=61ms
time-to-spawn:   p50=39ms p95=118ms p99=140ms
Report written: ./reports/mcst-2026-09-11T....json
```

## Docs

- [Usage & CLI](docs/usage.md)
- [Web control panel](docs/gui.md) - run everything from the browser with `mcst gui`
- [Control-plane API](docs/api.md) - drive runs over HTTP with `mcst serve`
- [Debug mode & Bot API](docs/debug.md) - drive one bot interactively with `mcst debug`
- [Security scan](docs/security-scan.md) - defensive `mcst scan` for servers you own
- [Metrics explained](docs/metrics.md) - including how the TPS estimate works and its limits
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Contributing](CONTRIBUTING.md) · [Security & responsible use](SECURITY.md)

## Development

```bash
npm run typecheck
npm run test:unit          # fast
npm run test:integration   # real Paper server; needs Java 25+
```

## License

[MIT](LICENSE) © Doğukan Metan
