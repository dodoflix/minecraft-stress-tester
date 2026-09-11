# Web control panel (`mcst gui`)

`mcst gui` launches a local web control panel: start and stop runs, watch live metrics, edit
and validate configs, and browse past run reports, all from the browser.

```bash
mcst gui                 # http://127.0.0.1:8080
mcst gui --port 9000
```

Open the printed URL. The page is served by the control-plane API (see [docs/api.md](api.md))
and carries the API token, so no login is needed. It binds `127.0.0.1` by default.

## What you can do

- **Runs**: fill in target/bots/driver/hold, confirm authorization, and start a run. The runs
  table updates live; a running run streams metrics (active, spawned, TPS, connect p95, packet
  rate, kicks) over SSE, with a stop button.
- **Configs**: list saved configs, load one into the editor, validate against the schema, save,
  or delete.
- **History**: browse past run reports and view the full JSON.

## Implementation

The panel is a single self-contained page (no build step, no external CDNs) that speaks the same
REST + SSE endpoints as the CLI. It is intentionally lean; a richer React/shadcn build can
replace the page later without changing the API it talks to.
