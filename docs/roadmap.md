# Roadmap

The v1 CLI and the v2 platform are both in the tree (release history is in the
[CHANGELOG](../CHANGELOG.md)). This page tracks what shipped and what is still ahead.

## v2 - shipped

v2 turned the CLI into a platform: one headless engine behind a stable API, with the CLI, the
web UI, and blueprints all as clients of it.

- **Control-plane API** (`mcst serve`) - REST to start/stop/list runs, live metrics over SSE,
  config validate/CRUD, run history. localhost + bearer token. See [api.md](api.md).
- **Bot API + debug mode** (`mcst debug`) - a stable single-bot surface (move/look/pathfind,
  chat/commands, world/entity/inventory queries, events) and an interactive console. See
  [debug.md](debug.md).
- **Web control panel** (`mcst gui`) - runs, live metrics, config editing, and history from the
  browser. See [gui.md](gui.md).
- **Programmable bots** (`mcst script`, `mcst debug --script`) - blueprint-driven bots (data,
  no sandbox) that eject to editable TypeScript. See [scripting.md](scripting.md).
- **Automatic free proxies** (`proxies.auto`) - fetch + validate free public SOCKS5/SOCKS4 proxies.
- **Defensive security scan** (`mcst scan`) - fingerprint + curated advisories + osv.dev +
  best-effort plugin detection. See [security-scan.md](security-scan.md).

## v2.1 - shipped

The v2 slices are now the full product. Each landed behind the seams already in place (the
control-plane API, the Bot API, the blueprint model, the zod schema), none reaching into engine
internals.

- **Monorepo** (`packages/core` / `packages/server` / `packages/ui`): an npm-workspaces split.
  `core` is the engine library + `mcst` CLI; `@mcst/server` wraps it with the control-plane; `@mcst/ui`
  is the web app. See [architecture.md](architecture.md).
- **Full web UI** (React + Vite + Tailwind + shadcn/ui): a single-page app with a runs dashboard
  (live SSE metrics), a config editor (Monaco YAML **and** a form generated from the zod schema, so it
  never drifts from the CLI), a history browser reusing the one HTML report renderer, plus Scripts,
  Graph, and Console tabs. Bundled by Vite, served under a strict CSP with no external CDNs. See
  [gui.md](gui.md).
- **Sandboxed user scripts**: arbitrary user JS per bot in a real worker-thread isolate exposing only
  the Bot API over message passing, with CPU/memory/time limits and no fs/net/env, never in-process
  `eval`. Headless (`mcst debug --user-script`) and in-UI. See [scripting.md](scripting.md).
- **Visual node editor**: a React Flow graph that compiles to the same blueprint model and Bot API
  (a code generator, not a second engine); graphs and blueprints round-trip. See [scripting.md](scripting.md).
- **Composable behavior pipelines**: the built-in `behaviors.*` toggles are gone; behavior is a
  per-bot ordered pipeline of stages, each gating the next on a completion signal, with a standard
  library (auth/commands/chatSpam/antiAfk/movement + blueprint stages). See [pipeline.md](pipeline.md).
- **Deeper security recon**: plugin detection from plugin-message channels, command namespaces, and
  the brand; best-effort version probing; curated version-range advisories blended with live osv.dev
  CVE matching; all confidence-labeled and non-destructive. See [security-scan.md](security-scan.md).
- **Bidirectional transport**: a WebSocket channel for the remote debug console and live script
  control (SSE stays the one-way metrics stream), same localhost + token default, versioned. See
  [api.md](api.md).
- **Packaging**: `core` publishes to npm (`npx minecraft-stress-tester`), with `@mcst/server` and
  `@mcst/ui` alongside, plus a container image for serve/gui. The authorization gate and
  localhost-by-default posture hold in every distribution. See [install.md](install.md).

## Later

- **Distributed runner**: shards running on several machines reporting into one aggregate.
- **Advisory data**: grow the curated plugin version-range rules as reliable data appears (osv.dev
  already provides live CVE matching for plugins with a known coordinate).

## Guiding principles

- **Headless-first, API-driven.** Every capability ships behind the control-plane API before it
  grows UI. The UI is a client, never the only path.
- **One source of truth.** The zod config schema drives validation, the CLI, the API, and the
  UI's forms. The `BotDriver` interface and the Bot API are the only seams drivers and scripts touch.
- **One runtime per concern.** The visual node graph compiles to the same Bot API the code
  editor uses, not a second interpreter. Reports have one renderer, shared by web and file.
- **Security-gated and honest.** The authorization gate stays load-bearing. Anything that probes
  or attacks (proxies, the security scanner) is authorized-only, non-destructive by default, and
  framed for defenders. See [Security & ethics](#security--ethics).
- **Small, testable core.** Keep the 95% coverage bar on pure logic; isolate I/O (sockets, child
  processes, the browser, user scripts) behind tested seams.

## Security & ethics

The proxy and security-testing features are dual-use. They ship under hard constraints:

- **Authorized targets only.** The consent gate applies, with an extra explicit opt-in for the
  security mode. Default target is localhost; no bundled target lists.
- **Defensive framing.** The security mode detects and reports for patching (responsible
  disclosure) and performs only **non-destructive** checks. It ships no weaponized exploits,
  denial-of-service payloads, or anything aimed at third-party servers.
- **Docs lead with the policy.** Legal/responsible-use notes stay front and center, as in
  [SECURITY.md](../SECURITY.md).

## Non-goals

- Botting/cheating on servers you don't control, griefing, or account farming.
- Bundling or brokering paid infrastructure.
- Shipping public exploit code.

