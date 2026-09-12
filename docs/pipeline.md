# Behavior pipeline

A bot's in-world behavior is a **pipeline**: an ordered list of stages, run per bot, where each
stage gates the next on success. This replaces the old `behaviors.*` on/off toggles.

```yaml
pipeline:
  - use: auth # runs first
    with: { password: "secret" }
    onFailure: retry
    retries: 2
  - use: commands # only after auth succeeds
    with: { list: ["/survival"] }
  - use: chatSpam # daemon: starts and keeps running
    with: { message: "hello", delayMs: 5000 }
```

Each stage reports a completion signal (`succeeded` / `failed` / `done`); the runner advances on a
non-failure and, on a failure, applies the stage's policy. Gating stages (`auth`, `commands`, a
`blueprint`) complete when their work is done; daemon stages (`chatSpam`, `antiAfk`, `movement`)
report success as soon as they start and keep running until the bot ends.

## Stage fields

| Field | Meaning |
|-------|---------|
| `use` | Stage kind: `auth`, `commands`, `chatSpam`, `antiAfk`, `movement`, `blueprint`. |
| `with` | Options for that stage (see below). |
| `onFailure` | On a failed stage: `continue` (default), `stop` the pipeline, or `retry`. |
| `retries` | Max retries when `onFailure: retry` (default 0). |
| `timeoutMs` | Fail the stage if it does not complete in this long (default: wait indefinitely). |

## Standard library (the old behaviors)

| Stage | `with` options | Was |
|-------|----------------|-----|
| `auth` | `password`, `loginCommand`, `registerCommand`, `delayMs` | `behaviors.auth` |
| `commands` | `list`, `delayMs` | `behaviors.commands` |
| `chatSpam` | `message`, `delayMs` | `behaviors.chatSpam` |
| `antiAfk` | `intervalMs` | `behaviors.antiAfk` |
| `movement` | `intervalMs` | `behaviors.movement` (FullBot only) |
| `blueprint` | `blueprint` (a blueprint object) | new: run a blueprint's spawn rules as a stage |

## Migrating from `behaviors.*`

Turn each enabled behavior into a `pipeline` entry, dropping `enabled` and nesting the rest under
`with`. Order matters, so put `auth` (and `commands`) before the daemons:

```yaml
# before
behaviors:
  auth: { enabled: true, password: "pw" }
  antiAfk: { enabled: true }
  chatSpam: { enabled: false }

# after
pipeline:
  - use: auth
    with: { password: "pw" }
  - use: antiAfk
```

A disabled behavior simply becomes an omitted stage; an empty `pipeline: []` runs no behaviors.
Scenarios (`--scenario`) set the pipeline for you, and a config or CLI value still overrides them.

## Blueprint stages and scale

A `blueprint` stage runs the blueprint's `spawn` rules over the scale drivers via the shared Bot API
(see [scripting.md](scripting.md)); a blueprint can end with a `succeed`/`fail` action to gate the
next stage. World queries and pathfinding need a full client, so they are inert on the light driver.
Arbitrary user JavaScript runs per single bot through the sandboxed runner, not per bot at scale (a
worker isolate per bot does not scale to thousands); see [scripting.md](scripting.md).
