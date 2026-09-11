# Changelog

## [1.3.0](https://github.com/dodoflix/minecraft-stress-tester/compare/v1.2.0...v1.3.0) (2026-09-11)


### Features

* allow shards in config ([#32](https://github.com/dodoflix/minecraft-stress-tester/issues/32)) ([0f9506e](https://github.com/dodoflix/minecraft-stress-tester/commit/0f9506e17666e2a7870ca45fe026d8ea1a0553f5))
* automatic free proxies + HTTP CONNECT ([#36](https://github.com/dodoflix/minecraft-stress-tester/issues/36)) ([e8e3589](https://github.com/dodoflix/minecraft-stress-tester/commit/e8e3589a2a8c07e352d39da57a82fdc0b02edda2))
* bot API + debug mode ([#35](https://github.com/dodoflix/minecraft-stress-tester/issues/35)) ([089c4a2](https://github.com/dodoflix/minecraft-stress-tester/commit/089c4a2d44244099c4f1975f78a7a95550006815))
* control-plane API ([#34](https://github.com/dodoflix/minecraft-stress-tester/issues/34)) ([0ad8cc9](https://github.com/dodoflix/minecraft-stress-tester/commit/0ad8cc9fb799572fd1dc4ae06ee04435f5d1207a))
* defensive security scanner ([#37](https://github.com/dodoflix/minecraft-stress-tester/issues/37)) ([b6f51da](https://github.com/dodoflix/minecraft-stress-tester/commit/b6f51da3afd81afd0bfa24ad0538c9c4306f11ea))
* programmable bots via blueprints ([#39](https://github.com/dodoflix/minecraft-stress-tester/issues/39)) ([8d0efef](https://github.com/dodoflix/minecraft-stress-tester/commit/8d0efeffe9106028e11bff57402988e2d6c57cac))
* web control panel ([#38](https://github.com/dodoflix/minecraft-stress-tester/issues/38)) ([acf7f88](https://github.com/dodoflix/minecraft-stress-tester/commit/acf7f8811f5cdbe247148063dbf864d9660544ed))


### Bug Fixes

* make auto-proxies actually work (hang, validation, providers) ([#43](https://github.com/dodoflix/minecraft-stress-tester/issues/43)) ([b4dce18](https://github.com/dodoflix/minecraft-stress-tester/commit/b4dce18c50c18813f8201a97bf44628e3a933787))
* subcommand option parsing + repo polish ([#41](https://github.com/dodoflix/minecraft-stress-tester/issues/41)) ([075435a](https://github.com/dodoflix/minecraft-stress-tester/commit/075435afd0180584414d511a8f5439dc81e768aa))


### Performance

* request low view distance per bot; hint sharding for big counts ([#29](https://github.com/dodoflix/minecraft-stress-tester/issues/29)) ([61efeac](https://github.com/dodoflix/minecraft-stress-tester/commit/61efeacb17006fbda783e0affc08c5ede2823a74))

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
