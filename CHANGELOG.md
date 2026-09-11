# Changelog

## [1.0.1](https://github.com/dodoflix/minecraft-stress-tester/compare/v1.0.0...v1.0.1) (2026-09-11)

### CI/CD

* automate releases with release-please ([d7ffb67](https://github.com/dodoflix/minecraft-stress-tester/commit/d7ffb674210cdfd85da9e66958a592f7d1ff1174))
* real-server integration on Java 25 (Paper 26.x requirement); coverage runs Java-free; unit tests on a single Node version ([ec24051](https://github.com/dodoflix/minecraft-stress-tester/commit/ec2405100ee06797789ed3a3f314a94953beccca))
* split typecheck into its own job; rename the matrix job to unit tests ([6cee203](https://github.com/dodoflix/minecraft-stress-tester/commit/6cee203d56ebe65ab3625b00c303495b9cc52ada))
* use plain `v`-prefixed release tags ([bb496b1](https://github.com/dodoflix/minecraft-stress-tester/commit/bb496b181fc53e4869ff4ac287aa217df1f4ddee))

### Removed

* legacy `config.json` auto-migration — use the YAML/JSON config schema directly

## [1.0.0](https://github.com/dodoflix/minecraft-stress-tester/compare/v0.5...v1.0.0) (2026-09-11)

Complete TypeScript rewrite of the old v0.5 tool, focused on measurement and scale.

### Features

* server-impact metrics: TPS estimate (from the `worldAge` tick counter), connection funnel with p50/p95/p99, success rate, packet/byte throughput, kick-reason histogram
* LightBot raw-protocol driver (~1–2k bots per process) with auto version negotiation
* ramp scheduler (connections/sec, ramp-up, hold, jitter) and engine-owned exponential-backoff reconnect
* authorization gate, SLP preflight, YAML/JSON config + CLI, console live view, JSON run report
* real-server integration test against the newest supported Paper build
* behavioral test suite with a 95% coverage gate; Biome lint/format; lefthook git hooks; CI + Dependabot

### Fixed

* removed the broken reconnection module (circular require, `undefined:undefined` reconnect target)
