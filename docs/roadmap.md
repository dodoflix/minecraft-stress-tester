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

The v2 platform is functional but each capability shipped its smallest useful slice. The work
below turns those slices into the full product, in dependency order. Every item builds on the
seams already in place (the control-plane API, the Bot API, the blueprint model, the zod
schema), so none of it reaches into engine internals.

### Monorepo split (`core` / `server` / `ui`)

**Goal.** Restructure into an npm-workspaces monorepo so the UI can grow without tangling the
engine.

**Scope.** `core` = today's `src/` (engine, drivers, metrics, config), published as the library
plus the `mcst` CLI. `server` = the control-plane API wrapping `core`. `ui` = the React app,
built to static assets the `server` serves. Keep the CLI, the `mcst` bin, and the public API
stable across the move.

**Best practices.** Do the split before the UI grows, not after. One build graph; `core` stays
importable and headless.

**Depends on.** Nothing new; it is the enabler for the full UI.

### Full web UI (React + Vite + Tailwind + shadcn/ui)

**Goal.** Replace the self-contained control-panel page with a real single-page app that does
everything from the browser.

**Scope.** A runs dashboard (live metrics off the existing stream, ramp/scenario controls); a
config editor with both a Monaco/CodeMirror YAML view **and** an interactive form generated
from the zod schema, with live validation; a history browser that reuses the HTML report
renderer as a React view; theme-aware, responsive. Bundled by Vite into static assets served by
`server`, with **no external CDNs** (strict CSP). Ship the built assets in the package.

**Best practices.** Generate the config form from the schema so the UI never drifts from the
CLI. One report renderer shared by web and file.

**Depends on.** The monorepo split; the control-plane API (shipped).

### Sandboxed user scripts

**Goal.** Let users author arbitrary TypeScript/JavaScript per bot, run safely, next to today's
data-only blueprints.

**Scope.** An in-UI Monaco code editor writing against the Bot API; execution inside a **real
isolate** (a locked-down worker thread, or `isolated-vm`) that exposes only the Bot API over
message passing, with CPU/memory/time limits. Import/export scripts as files. The headless
runner can land before the editor.

**Best practices.** This is a hard security boundary: treat user code as hostile, never
`eval` in-process, expose no `fs`/`net`/`env` beyond the Bot API surface, and cap resources.
One canonical Bot API, already defined.

**Depends on.** The Bot API (shipped); the UI (for the editor).

### Visual node editor

**Goal.** Author blueprints visually, Unreal-style.

**Scope.** A node graph (e.g. React Flow) of event nodes (onSpawn, onChat, onDeath), action
nodes (move, chat, wait, goto, stop), and control flow, that **compiles to the same blueprint
model and Bot API** today's JSON blueprints and `mcst script eject` use. Import/export graphs as
JSON; eject a graph to editable code; blueprints round-trip to and from the graph.

**Best practices.** The graph is a code generator over the one canonical blueprint/Bot API,
never a second engine.

**Depends on.** The UI; the blueprint model (shipped).

### Deeper security recon and advisory data

**Goal.** Detect and match more, while staying defensive and honest.

**Scope.** Broaden plugin detection (more probes, plugin-channel fingerprints, response
heuristics), add best-effort plugin-version detection to unlock CVE matching, and grow advisory
matching by blending the curated rules with osv.dev and version-range checks as reliable data
appears. Findings stay actionable and labeled by confidence.

**Best practices.** Non-destructive checks only; report for patching; never ship exploits. See
[Security & ethics](#security--ethics).

**Depends on.** The scanner (shipped).

### Bidirectional transport and remote control

**Goal.** Interactive, bidirectional control over the network, and driving a run from another
machine.

**Scope.** Add a WebSocket channel to the control-plane for the debug console and live script
control (SSE stays for one-way metrics). Optionally, a distributed runner mode where shards run
on several machines and report into one aggregate.

**Best practices.** Keep localhost + token as the default; require an explicit opt-in for any
non-local binding; version the API.

**Depends on.** The control-plane API and Bot API (shipped).

### Packaging and distribution

**Goal.** Make it trivial to install and run.

**Scope.** Publish `core` to npm (so `npx mcst` works), and provide a container image for
`mcst serve` / `mcst gui`. Keep the authorization gate and localhost-by-default posture intact
in every distribution.

**Depends on.** The monorepo split (for a clean library boundary).

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
