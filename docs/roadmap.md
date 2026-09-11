# Roadmap

The v1 CLI stress tester is complete (shipped history is in the [CHANGELOG](../CHANGELOG.md)).
This roadmap is v2.

## v2 - from a CLI tool to a testing & development platform

The goal of v2 is to let someone run, script, debug, and security-test a Minecraft server
**entirely from a UI**, while keeping the CLI first-class. The theme is one headless engine
behind a stable API, with the CLI, the UI, and user scripts all as clients of it.

### Guiding principles

- **Headless-first, API-driven.** Every capability ships as a headless feature behind a
  local control-plane API before it grows a UI. The UI is a client, never the only path.
- **One source of truth.** The zod config schema drives validation, the CLI, the API, and
  the UI's forms. The `BotDriver` interface and a new **Bot API** are the only seams drivers
  and scripts touch.
- **One runtime per concern.** The visual blueprint compiles to the same Bot API the code
  editor uses - not a second interpreter. Reports have one renderer, shared by web and file.
- **Security-gated and honest.** The authorization gate stays load-bearing. Anything that
  probes or attacks (proxies, the security scanner) is authorized-only, non-destructive by
  default, and framed for defenders. See [Security & ethics](#security--ethics).
- **Small, testable core.** Keep the 95% coverage bar on pure logic; isolate I/O
  (sockets, child processes, the browser, user scripts) behind tested seams.

### Structure

Move to an npm-workspaces monorepo as the UI lands:

- `core` - the engine, drivers, metrics, config (today's `src/`), published as the library + CLI.
- `server` - the control-plane API (HTTP + WebSocket) that wraps `core`.
- `ui` - the React app (Vite + TypeScript + Tailwind + shadcn/ui), built to static assets
  the `server` serves.

---

## Phase 6 - Control-plane API (foundation)

**Goal.** A local daemon that exposes the engine over HTTP + WebSocket, so runs can be
started/stopped, streamed, and inspected programmatically. `mcst serve` starts it.

**Scope.** REST/WS endpoints: start/stop/list runs, live metrics stream (reuse the SSE
snapshot), CRUD + validate config files (via the zod schema), list past runs and fetch their
JSON/CSV/HTML reports. Persist run history under `reports/` (already the format).

**Best practices.** Bind to `localhost` by default with a generated API token (stop other
local processes from driving your bots). Keep `core` importable and headless; the server only
orchestrates. Version the API.

**Why first.** The UI, remote control, and future automation all consume this. Building it now
avoids a UI that reaches into engine internals.

---

## Phase 7 - Bot API + Debug mode

**Goal.** A single, stable programmatic interface to one bot (built on FullBot), plus an
interactive way to drive it: `mcst debug` attaches one bot and opens a REPL/console; the same
console appears in the UI. Lets you inspect and develop against a live server.

**Scope.** The **Bot API**: movement (walk/look/pathfind), chat + run commands, world/block/
entity/inventory queries, and typed events (spawn, chat, death, ...). A REPL over it, and the
control-plane surface to send commands + stream state.

**Best practices.** This Bot API is the foundation the scripting engine (Phase 9) reuses -
define it once, deliberately, with a small stable surface. mineflayer already provides world/
entity/inventory reads; wrap them, don't reinvent.

**Depends on.** Phase 6 (to expose the console remotely); the CLI REPL can land first.

---

## Phase 8 - Web UI (`--gui`)

**Goal.** Do everything from the browser. `mcst --gui [--gui-port]` launches the UI (and,
as you asked, ignores the other run flags - the UI drives runs).

**Scope.**

- **Runs**: start/stop, live dashboard (reuse the metrics stream), the ramp/scenario controls.
- **Config**: a YAML editor (Monaco/CodeMirror) *and* an interactive form generated from the
  zod schema, with live validation. Save, load, duplicate configs.
- **History**: browse past runs and their reports (reuse the HTML report renderer as a React view).
- **Panels** for the debug console (Phase 7) and the script editor (Phase 9) as they land.

**Best practices.** React + Tailwind + shadcn/ui, bundled with Vite into static assets served
by the Phase 6 server - no external CDNs (strict CSP), theme-aware. Generate the config form
from the schema so the UI never drifts from the CLI. Ship built assets in the package.

**Depends on.** Phase 6 (its only backend).

---

## Phase 9 - Programmable bots (scripting)

**Goal.** User-defined bot behavior, per bot, authored two ways and portable.

**Scope.**

- **Code editor**: TypeScript/JS scripts against the Bot API (Phase 7), edited in-UI (Monaco),
  run per bot.
- **Visual blueprint** (Unreal-style node graph, e.g. React Flow): event nodes (onSpawn,
  onChat), action nodes (move, chat, wait), and control flow - which **compile to the same
  Bot API**, not a separate engine.
- **Import/export**: scripts as files, blueprints as JSON graphs; both round-trip, and a
  blueprint can be ejected to editable code.

**Best practices.** One canonical Bot API; the blueprint is a code generator over it. Run
untrusted user scripts **sandboxed** (an isolated VM / locked-down worker with only the Bot API
exposed) - never `eval` in-process. Generalize today's `Behavior` concept into scriptable hooks.

**Depends on.** Phase 7 (the Bot API), Phase 8 (the editors).

---

## Phase 10 - Automatic free proxies

**Goal.** Use free public proxies with zero registration or payment.

**Scope.** A provider layer that fetches free public proxy lists, a **validator** that
health-checks each (can it reach the target? latency? does the MC handshake complete?), and a
rotating pool that culls dead ones and refreshes on a schedule - feeding the existing
`ProxyPool`. Add **HTTP CONNECT** proxy support (most free proxies are HTTP, not SOCKS5).
Config: `proxies.auto: true` (+ provider selection).

**Best practices.** Free proxies are unreliable and often untrustworthy - over-fetch, validate
hard, rotate fast, and surface a clear warning that traffic (and your target's IP exposure)
passes through third parties. Keep the authorization gate: distributing a load across borrowed
IPs must still be an authorized test.

**Depends on.** Nothing new; extends the shipped proxy pool. Can land in parallel.

---

## Phase 11 - Security testing mode (authorized, defensive)

**Goal.** Help operators **find and patch** weaknesses on servers they own: fingerprint the
server and its plugins, match against known advisories/CVEs, and produce a report.

Everything here is **best-effort**: fingerprint what a client can observe, report where the data
supports it, and say "detected, no advisory data" rather than guess when it doesn't.

**Scope.**

- **Recon**: server software + version from the SLP preflight and the `minecraft:brand` packet
  (Paper/Spigot/Purpur/vanilla). Plugin detection is best-effort: `/` command tab-complete
  enumeration, `/pl` and `/version` responses, and observed plugin-channel register/unregister
  packets. (These are the same techniques server admins install plugins to block, which is what
  confirms they work; many can be defeated, so results are a floor, not a guarantee.)
- **Known-issue matching**: query [osv.dev](https://osv.dev/) live (`/v1/query`, `Maven`
  ecosystem for plugins) for detected software + versions and report what's outdated or
  known-vulnerable, with remediation notes. No bundled CVE database to go stale.
- **Safe checks only**: non-destructive verification of specific known issues, for the operator's
  own server.

**This ships as a defensive scanner, not an attack toolkit.** See below.

---

## Security & ethics

The proxy and security-testing features are dual-use. They ship under hard constraints:

- **Authorized targets only.** The existing consent gate applies, with an extra explicit opt-in
  for the security mode. Default target is localhost; no bundled target lists.
- **Defensive framing.** The security mode detects and reports for patching (responsible
  disclosure), and performs only **non-destructive** checks. It will not ship weaponized
  exploits, denial-of-service payloads, or anything aimed at third-party servers.
- **Docs lead with the policy.** Legal/responsible-use notes stay front and center, as in
  [SECURITY.md](../SECURITY.md).

## Non-goals

- Botting/cheating on servers you don't control, griefing, or account farming.
- Bundling or brokering paid infrastructure.
- Shipping public exploit code.

## Sequencing at a glance

```
6 API ─┬─▶ 7 Bot API + debug ─┬─▶ 9 scripting
       └─▶ 8 Web UI ──────────┘
10 free proxies      (parallel, extends the proxy pool)
11 security scanner  (parallel, defensive, gated)
```

Each phase still ships something usable on its own, smallest useful slice first.
