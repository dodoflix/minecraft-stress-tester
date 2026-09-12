# AGENTS.md

Guidance for any AI agent working in this repo. Read this before making changes.

## What this is

`minecraft-stress-tester`: a detailed open-source load tester for Minecraft servers that measures
server impact (TPS, connection funnel, latency, throughput, kicks). TypeScript, ESM, Node >= 24.
The v1 CLI and the v2 platform are shipped; remaining work is in `docs/roadmap.md` ("What's next").

## Quality gates (all enforced in CI; keep every one green)

- `npm run typecheck` (tsc, no emit)
- `npm run lint` (Biome strict; `npm run lint:fix` autofixes). Fix warnings too, keep it clean.
- `npm run test:unit` (fast) and `npm run test:coverage` (**95% gate** on lines/branches/functions/
  statements, global, in `vitest.config.ts`)
- `npm run test:integration` (boots a real Paper server; needs Java 25+)
- `lefthook` runs Biome pre-commit and typecheck+unit pre-push automatically.

## The dominant pattern: pure core, excluded I/O

Untestable I/O (sockets, child processes, the mineflayer/minecraft-protocol adapters, the HTTP
server, the browser page) lives in thin files listed under `coverage.exclude` in `vitest.config.ts`.
Everything else is pure, injectable, and unit-tested to hold 95%. When you add a networked or
process-spawning capability: isolate the I/O in one excluded file, and unit-test the pure logic
that drives it (parsing, routing, orchestration, formatting) with injected fakes. Never lower the
gate or exclude a file just to pass; only exclude genuine I/O shims.

## Workspace layout

An npm-workspaces monorepo: `packages/core` (`minecraft-stress-tester`, the engine library + `mcst`
CLI, published to npm), `packages/server` (`@mcst/server`, the control-plane API + UI shell wrapping
core), `packages/ui` (`@mcst/ui`, the web app). Dependencies point one way: server and ui depend on
core; core depends on neither. `mcst serve`/`gui` load `@mcst/server` with a dynamic import so core
has no build-time cycle. Root scripts (`npm run typecheck|lint|test:coverage|build`) span all
workspaces; the 95% coverage gate is global in `vitest.config.ts`.

## Architecture map (`packages/core/src/`, except server/ui which live in `@mcst/server`)

- `cli.ts` (excluded): commander CLI, `enablePositionalOptions()`. Subcommands: default run,
  `serve`, `gui`, `debug`, `scan`, `script`.
- `config/schema.ts`: the **zod schema is the single source of truth** for config (validation, CLI,
  API, and future UI forms all derive from it). `config/load.ts` merges file + CLI + scenarios.
- `engine/`: `engine.ts` orchestrator (**owns reconnection** via `registry.ts`; never reintroduce
  per-bot self-reconnect), `ramp.ts`, `shard.ts` (pure), `sharded.ts` (child-process fan-out, excluded).
- `drivers/`: `driver.ts` = `BotDriver`/`BotSpec`/`BotEventMap`/`TypedEmitter`. `light.ts` (scale),
  `full.ts` (realism), both excluded. Guard every underlying-lib call (`typeof bot?.x === "function"`):
  bots reach half-initialized states (limbo/transfer) where methods are not attached yet.
- `bot/botApi.ts`: the **Bot API** (`DebugBot` interface) is THE stable seam scripts/blueprints use.
  `bot/repl.ts` is the pure `mcst debug` dispatcher.
- `net/`: `proxy.ts` (pool, `parseProxy`, `isLocalHost`), `proxyConnect.ts`/`proxyProbe.ts` (SOCKS5/4
  tunnel + MC-status validation, excluded), `autoProxies.ts` (fetch/parse/dedupe/pick/probe, tested),
  `slp.ts` (preflight), `accounts.ts`.
- `@mcst/server` (`packages/server/src/`): control-plane API, pure `router.ts`/`runManager.ts`/
  `configStore.ts`/`history.ts` (tested) + `httpServer.ts` (socket + SSE, serves the built `@mcst/ui`
  assets + a token script under a strict CSP, excluded) + `wsServer.ts` (bidirectional WebSocket at /ws for the debug console + live script control, excluded; pure `wsProtocol.ts`/`wsRouter.ts` tested). Imports core via `minecraft-stress-tester`.
- `scan/`: defensive scanner (fingerprint, curated version + plugin advisories, osv.dev CVE matching,
  plugin detection from channels/commands/brand + best-effort version probe, all confidence-labeled;
  pure + tested; `recon.ts` excluded). Non-destructive: read-only status ping, tab-complete, /version.
- `script/`: `blueprint.ts` (zod model, event-triggered actions), `run.ts` (interpreter), `compile.ts`
  (eject to TS), `graph.ts` (visual node graph <-> blueprint converter, a code generator not a second
  engine; round-trips). Pure + tested. `script/sandbox/`: `protocol.ts` (allowlist + `dispatchScriptCall`,
  pure + tested) drives untrusted user JS run in a worker-thread isolate (`host.ts`/`worker.ts`,
  excluded I/O). Never `eval` user code in-process; the isolate reaches only the allowlisted Bot API.
- `@mcst/ui` (`packages/ui/`): the React + Vite + Tailwind + shadcn SPA (dashboard, schema-driven
  config editor + Monaco YAML, history). Browser I/O, excluded from coverage; the form descriptor it
  renders is the pure, tested `config/formSchema.ts` in core, so the UI cannot drift from the CLI.
- `pipeline/`: the per-bot behavior pipeline that replaced the old `behaviors.*` toggles. `stage.ts`
  (Stage + completion signal succeeded/failed/done), `runner.ts` (ordered, gated, retry/timeout
  execution; pure + tested), `stdlib.ts` (the standard library: auth/commands/chatSpam/antiAfk/
  movement + a blueprint stage). Config is a per-bot ordered `pipeline` list; each stage gates the next.

## Invariants (do not regress)

- **Authorization gate** (`safety/authorization.ts`) is load-bearing; no run without explicit consent.
- **Proxy privacy:** when proxies are enabled the target is never contacted from the real IP.
  Preflight is skipped, shard workers skip preflight, bots and their auto-version pings go through the
  proxy, and a bot with no free proxy fails rather than connecting direct.
- **Security scanner** stays defensive and non-destructive; no exploits, no DoS.
- **Untrusted user code** runs in a real isolate, never in-process `eval`.

## Non-negotiable constraints

1. Never add "Generated with Claude Code", any AI/Claude attribution, `Co-Authored-By`, or session
   links anywhere (commits, PRs, code, docs).
2. Never use em dashes or en dashes (the long dash characters), curly/smart quotes, or the single
   ellipsis character. Use plain hyphens, commas, parentheses, straight quotes, and `...` (three dots).
3. No internal planning scaffolding in durable artifacts: no "phase N", step/sprint/ticket numbers, or
   roadmap-stage labels in commits, PR titles/descriptions, comments, or docs. Say what the change does.
4. Commit messages: terse, factual. Subject says what changed; body only if needed (2-4 lines, root
   cause/fix), no narration, no diff restatement.
5. Do not merge PRs. Open each and leave it for the human. Delete your feature branch only after they
   merge. Batch related changes into one PR, not many tiny ones. Leave the repo clean.
6. README is a storefront: keep it short; deeper content goes in `docs/` with links.
7. Coverage stays >= 95%; Biome and typecheck stay clean.
8. Security is never simplified away (see Invariants).
9. Prefer stdlib/existing deps over new ones; when you do add one, pin the latest version.

## Per-task workflow

1. Branch off `master` (stack on a prior unmerged branch only if it genuinely depends on that work;
   note the dependency in the PR).
2. Understand the code the change touches (trace the real flow) before editing. Then implement with the
   pure-core / excluded-I/O split and add unit tests to hold 95%.
3. Run typecheck, lint, and `test:coverage` (all green). Smoke-test any I/O path by hand (start the
   server and curl it, run the CLI, etc.).
4. Update `docs/` and link from README; add `examples/` where relevant.
5. Commit (clean messages), push, open a PR describing what and why. Leave it unmerged.
