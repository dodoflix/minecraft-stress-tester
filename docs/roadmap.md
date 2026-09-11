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

## What's next

Deferred enhancements, in rough priority order:

- **Richer web UI.** Replace the self-contained control-panel page with a React + Vite +
  Tailwind + shadcn/ui build (likely an npm-workspaces monorepo: `core` / `server` / `ui`),
  including the debug console and the visual script editor as panels. The API it speaks to is
  already in place.
- **Sandboxed user scripts + visual node editor.** Run arbitrary user TypeScript/JavaScript
  against the Bot API inside a real isolate (a locked-down worker exposing only the Bot API,
  never an in-process `eval`), and add an Unreal-style node graph (e.g. React Flow) that
  compiles to the same Bot API as today's blueprints.
- **Deeper security recon + advisory data.** Broaden plugin detection and grow the advisory
  matching beyond the curated set as reliable data sources allow. Best-effort by design.
- **WebSocket transport.** The metrics stream is SSE today; add WebSocket if bidirectional
  control (e.g. the remote debug console) needs it.

### Guiding principles

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
