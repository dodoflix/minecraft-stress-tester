# Changelog

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
