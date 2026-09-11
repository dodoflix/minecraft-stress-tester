# Changelog

All notable changes are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Removed

- Auto-migration of the legacy v0.x flat `config.json`. Use the YAML/JSON config schema directly.

### Fixed

- Integration CI uses Java 25 (Paper 26.x requires it); coverage runs Java-free; unit tests run on a single Node version.

## [1.0.0] - 2026-09-11

### Changed — complete rewrite (v0.5 → v1.0.0)

The old tool spawned mineflayer bots that connected, rotated their head, and spammed
chat on local offline servers, and measured nothing. v1 is a ground-up TypeScript
rewrite focused on measurement and scale.

### Added

- **Metrics engine**: server TPS estimated from `worldAge` packet cadence, connection
  funnel (attempt → connect → login → spawn) with p50/p95/p99, success rate, inbound
  packet/byte throughput, kick-reason histogram.
- **LightBot** driver on raw `minecraft-protocol` (scales to ~1–2k bots/process).
- **Ramp scheduler**: connections/sec with linear ramp-up, hold, jitter, and
  exponential backoff reconnect owned by the engine (not the bot).
- **Authorization gate**: refuses to run without explicit consent.
- **SLP preflight**, config file (YAML/JSON) + CLI, console live view + JSON run report.
- **Real-server integration test** against the latest supported Paper version.
- **Behavioral test suite** (100+ tests) with a **95% coverage gate**.
- **Biome** (strict lint + format) and **lefthook** git hooks (pre-commit lint, pre-push
  typecheck + tests), both enforced in CI.
- CI (lint + typecheck + unit + real-server integration + coverage), release workflow, Dependabot.

### Fixed

- Removed the broken reconnection module (circular require, `undefined:undefined`
  reconnect target).

[Unreleased]: https://github.com/dodoflix/minecraft-stress-tester/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/dodoflix/minecraft-stress-tester/compare/v0.5...v1.0.0
