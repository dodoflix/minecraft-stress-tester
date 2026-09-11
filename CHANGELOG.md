# Changelog

## [1.2.0](https://github.com/dodoflix/minecraft-stress-tester/compare/v1.1.0...v1.2.0) (2026-09-11)


### Features

* local dev server script (npm run server) ([3817440](https://github.com/dodoflix/minecraft-stress-tester/commit/38174400841d0fe7a45076fedff50dcb9efd41fa))

## [1.1.0](https://github.com/dodoflix/minecraft-stress-tester/compare/v1.0.1...v1.1.0) (2026-09-11)


### Features

* observability - TUI dashboard, CSV/HTML reports, in-session ping ([c002ff3](https://github.com/dodoflix/minecraft-stress-tester/commit/c002ff3963a46a1ccb010d453b35b5f3399fad59))
* polish - web dashboard, Docker, docs ([077d5f1](https://github.com/dodoflix/minecraft-stress-tester/commit/077d5f1fda182560cd21ab8fbe1ad9b0e0107339))
* real-world targets - proxy pool, account rotation, scenarios ([1f67639](https://github.com/dodoflix/minecraft-stress-tester/commit/1f67639027c0006e336ae68829765e5bce77f284))
* realism and scale - FullBot, movement behaviors, sharding ([576f808](https://github.com/dodoflix/minecraft-stress-tester/commit/576f808b6699cd1ae27d417517d10412fb6681b2))

## [1.0.1](https://github.com/dodoflix/minecraft-stress-tester/compare/v1.0.0...v1.0.1) (2026-09-11)

Maintenance release: CI hardening (real-server integration on Java 25, coverage gate, release automation) and internal cleanup. Removed the legacy `config.json` auto-migration.

## [1.0.0](https://github.com/dodoflix/minecraft-stress-tester/compare/v0.5...v1.0.0) (2026-09-11)

Complete TypeScript rewrite of the old v0.5 tool, focused on measurement and scale.

### Features

* server-impact metrics: TPS estimate (from the `worldAge` tick counter), connection funnel with p50/p95/p99, success rate, packet/byte throughput, kick-reason histogram
* LightBot raw-protocol driver (~1-2k bots per process) with auto version negotiation
* ramp scheduler (connections/sec, ramp-up, hold, jitter) and engine-owned exponential-backoff reconnect
* authorization gate, SLP preflight, YAML/JSON config + CLI, console live view, JSON run report
* real-server integration test against the newest supported Paper build
* behavioral test suite with a 95% coverage gate; Biome lint/format; lefthook git hooks; CI + Dependabot

### Fixed

* removed the broken reconnection module (circular require, `undefined:undefined` reconnect target)
