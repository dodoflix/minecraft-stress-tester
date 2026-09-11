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

## What is deferred

The visual node-graph editor and arbitrary user-authored TypeScript/JavaScript are not shipped
yet. Running untrusted code needs real isolation (a worker/isolate exposing only the Bot API),
which is deliberately not faked with an in-process `eval`. Blueprints cover the safe, useful core
today and are the compile target both editors will use. See the [roadmap](roadmap.md).
