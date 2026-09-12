# Programmable bots (blueprints)

Blueprints make a bot programmable without writing code. A blueprint is a small JSON document:
event-triggered sequences of actions over the [Bot API](debug.md). It is **data, not code**, so
it runs safely with no sandbox: you only pick from a vetted set of actions.

```bash
mcst script validate examples/blueprints/greeter.json
mcst script eject examples/blueprints/greeter.json bot.ts   # generate editable TypeScript
mcst debug --config examples/local.yaml --script examples/blueprints/greeter.json
```

## Shape

```json
{
  "name": "greeter",
  "rules": [
    { "on": "spawn", "actions": [{ "type": "chat", "message": "hi" }] },
    { "on": "chat",  "actions": [{ "type": "command", "command": "list" }] },
    { "on": "death", "actions": [{ "type": "wait", "ms": 2000 }, { "type": "stop" }] }
  ]
}
```

- **Triggers** (`on`): `spawn` (runs once on attach), `chat`, `death`.
- **Actions**: `chat`, `command`, `look` (yaw/pitch), `goto` (x/y/z, pathfinds), `wait` (ms), `stop`.

## Eject to code

`mcst script eject` compiles a blueprint to a TypeScript module that drives the Bot API directly,
so you can take it further in a real editor. The visual node graph compiles to this same Bot API.

## Sandboxed user scripts

Beyond data-only blueprints, you can run arbitrary user JavaScript against a bot. It executes in a
**real isolate** (a worker thread with its own V8 heap), never an in-process `eval`. The isolate is
given only the Bot API plus `console` and `sleep(ms)`; there is no `require`, `process`, `fs`, `net`,
or `env` by name, a memory cap, and a wall-clock timeout. Every bot method is async:

```js
const pos = await bot.position();
await bot.chat("hello");
bot.on("chat", (m) => console.log(m.username, m.message));
await sleep(1000);
```

Available: `chat`, `command`, `look`, `setControl`, `goto`, `stop`, `position`, `vitals`, `players`,
`nearbyEntities`, `inventory`, and `bot.on(event, cb)` for `chat`/`death`/`kicked`/`end`/`error`.

Run one headless against a bot you attach:

```bash
mcst debug --user-script examples/scripts/patrol.js -H <host> --i-am-authorized
```

or author, validate, and run it from the web UI's **Scripts** tab (over `POST /api/script/validate`
and `POST /api/script/run`; see [api.md](api.md)).

**How the boundary works.** The isolate can reach the host only by posting Bot API calls, which the
host validates against a fixed allowlist before touching the bot. This protects the host process and
bounds CPU/memory. It is built for the local, authorized, localhost-by-default posture: a determined
`vm` escape inside the worker would reach the worker's own realm, so do not expose script execution
to untrusted networks.

## Visual node editor

The web UI's **Graph** tab is a node editor (React Flow): drop event nodes (`spawn`/`chat`/`death`)
and action nodes (`chat`/`command`/`look`/`goto`/`wait`/`stop`), wire an event to a chain of actions,
and edit each node's fields. It is a code generator over the one blueprint model, not a second
engine: "Compile + eject" turns the graph into a blueprint and the same ejected TypeScript as
`mcst script eject`. Graphs import/export as JSON, and a blueprint round-trips into the graph
("Blueprint to graph"). Backed by `POST /api/graph/compile` and `POST /api/graph/import` (both pure;
see [api.md](api.md)).
