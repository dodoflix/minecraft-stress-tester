# Changelog

All notable changes are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [Unreleased]

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
- **SLP preflight**, config file (YAML/JSON) + CLI with legacy `config.json` migration,
  console live view + JSON run report.
- **Real-server integration test** against the latest supported Paper version.
- CI (typecheck + unit + real-server integration), release workflow, Dependabot.

### Fixed

- Removed the broken reconnection module (circular require, `undefined:undefined`
  reconnect target).

[Unreleased]: https://github.com/dodoflix/minecraft-stress-tester/compare/v0.5...HEAD
