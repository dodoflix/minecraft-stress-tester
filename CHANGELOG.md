# Changelog

All notable changes are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [1.0.1](https://github.com/dodoflix/minecraft-stress-tester/compare/v1.0.0...v1.0.1) (2026-09-11)


### CI/CD

* automate releases with release-please ([63e752a](https://github.com/dodoflix/minecraft-stress-tester/commit/63e752a015abd7b7550e9ae27bc2179f622a10bf))
* automate releases with release-please ([d7ffb67](https://github.com/dodoflix/minecraft-stress-tester/commit/d7ffb674210cdfd85da9e66958a592f7d1ff1174))
* exclude integration from coverage run, raise Paper boot timeout ([4362788](https://github.com/dodoflix/minecraft-stress-tester/commit/4362788689ec6efe6721e837d65fb8c98aff7134))
* fix coverage job (exclude integration) and raise Paper boot timeout ([ec24051](https://github.com/dodoflix/minecraft-stress-tester/commit/ec2405100ee06797789ed3a3f314a94953beccca))
* release-please plain v-prefixed tags ([3a9827d](https://github.com/dodoflix/minecraft-stress-tester/commit/3a9827d0521179ff7bc125ab4592183154e1f730))
* split typecheck into its own job, rename matrix job to unit tests ([fbd656c](https://github.com/dodoflix/minecraft-stress-tester/commit/fbd656c062255f5f164eccee9d6b38ec6cb364a6))
* split typecheck job, rename unit job ([6cee203](https://github.com/dodoflix/minecraft-stress-tester/commit/6cee203d56ebe65ab3625b00c303495b9cc52ada))
* use plain v-prefixed tags for release-please ([bb496b1](https://github.com/dodoflix/minecraft-stress-tester/commit/bb496b181fc53e4869ff4ac287aa217df1f4ddee))

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
