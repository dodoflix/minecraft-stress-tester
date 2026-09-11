# Minecraft Stress Tester

[![CI](https://github.com/dodoflix/minecraft-stress-tester/actions/workflows/ci.yml/badge.svg)](https://github.com/dodoflix/minecraft-stress-tester/actions/workflows/ci.yml)
[![coverage ≥95%](https://img.shields.io/badge/coverage-%E2%89%A595%25-brightgreen.svg)](.github/workflows/ci.yml)
[![release](https://img.shields.io/github/v/release/dodoflix/minecraft-stress-tester?label=release)](https://github.com/dodoflix/minecraft-stress-tester/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-brightgreen.svg)](package.json)

A detailed, open-source load tester for Minecraft servers. It connects a swarm of bots and
**measures what the load does to the server** (estimated TPS, connection funnel, latency,
throughput, kick reasons), instead of just opening sockets. Scales to thousands of bots across
processes and works against real servers.

> [!WARNING]
> This is a load generator. Run it **only** against servers you own or have explicit written
> permission to test. The tool refuses to start until you affirm authorization. See
> [SECURITY.md](SECURITY.md).

## Quickstart

```bash
git clone https://github.com/dodoflix/minecraft-stress-tester.git
cd minecraft-stress-tester
npm install
npm start -- --config examples/local.yaml      # or: --host 127.0.0.1 --count 100 --i-am-authorized
```

## Commands

| Command | Does |
| ------- | ---- |
| `npm start` / `mcst` | Run a load test. |
| `mcst gui` | Web control panel. |
| `mcst serve` | Control-plane API (REST + live metrics). |
| `mcst debug` | Interactive one-bot console. |
| `mcst scan` | Defensive security scan of a server you own. |
| `mcst script` | Programmable bots (blueprints). |

## Docs

- [Usage & CLI](docs/usage.md) · [Metrics](docs/metrics.md) · [Architecture](docs/architecture.md) · [Roadmap](docs/roadmap.md)
- [Web control panel](docs/gui.md) · [Control-plane API](docs/api.md) · [Debug & Bot API](docs/debug.md) · [Programmable bots](docs/scripting.md) · [Security scan](docs/security-scan.md)
- [Contributing](CONTRIBUTING.md) · [Security & responsible use](SECURITY.md)

## License

[MIT](LICENSE) © Doğukan Metan
