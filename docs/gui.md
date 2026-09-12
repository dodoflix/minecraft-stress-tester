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

- **Dashboard**: fill in target / bots / driver / scenario, confirm authorization, and start a
  run. The runs list updates live; selecting a running run streams metrics (attempted, connected,
  spawned, active, TPS, packet rate, KiB/s, kicks) over SSE, with a stop button.
- **Config**: edit a config as a schema-generated form **or** as YAML in a Monaco editor, kept in
  sync, with live validation against the config schema. Save, load, or delete named configs.
- **History**: browse past run reports; each opens the full HTML report (the same renderer the CLI
  writes to disk) in a sandboxed frame.
- **Scripts**: author user JavaScript in a Monaco editor (import/export), validate it, and run it in
  a sandboxed isolate against a target, streaming its logs.
- **Graph**: a visual node editor (event/action nodes) that compiles to the same blueprint model and
  ejects to code; graphs and blueprints round-trip.
- **Console**: a remote debug console over the WebSocket channel: attach a bot to a target and drive
  it live (the same commands as `mcst debug`), plus live script control.

## Implementation

The panel is a React + Vite + Tailwind + shadcn/ui single-page app (`@mcst/ui`), built to static
assets that `@mcst/server` serves under a strict CSP with no external CDNs (Monaco and its worker
are bundled locally). It speaks the same REST + SSE endpoints as the CLI. The config form is
generated from the zod schema (`GET /api/schema`), so it never drifts from the CLI; the history
view reuses the one HTML report renderer (`GET /api/history/:file/html`).
