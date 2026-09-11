# Contributing

Thanks for helping improve the stress tester. Keep changes small and tested.

## Setup

```bash
npm install
npm run typecheck
npm run test:unit          # fast, no server needed
npm run test:integration   # downloads + boots a real Paper server; needs a JDK (Java 21+)
```

`test:integration` provisions the newest Paper release that `minecraft-protocol`
can speak, caches the jar under `.mcst-cache/`, boots it offline on a flat world,
and runs real bots against it. It self-skips when no `java` is on PATH.

## Ground rules

- **Understand before you change.** Trace the flow; the smallest diff in the wrong
  place is a second bug.
- **Least code that works.** Reach for the stdlib and existing helpers before adding
  a dependency or an abstraction.
- **Test non-trivial logic.** A branch, loop, parser, or metric gets one runnable
  check. No frameworks beyond vitest.
- **Comments earn their place.** Write one only if removing it would let someone
  redo a mistake or miss a non-obvious constraint.
- **Commits:** terse and factual. Subject says what changed; body only if the *why*
  isn't obvious. No AI-slop padding.

## Architecture

See [docs/architecture.md](docs/architecture.md). New drivers implement the
`BotDriver` interface in `src/drivers/driver.ts`; new behaviors are
`(bot) => cleanup` functions in `src/behaviors/`; new metrics feed the collector.

## Safety

Never weaken the authorization gate (`src/safety/authorization.ts`) or add a way
to bypass it. PRs that do will be closed.
