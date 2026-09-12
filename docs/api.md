# Control-plane API

`mcst serve` starts a local daemon that drives the engine over HTTP, so runs can be
started, stopped, streamed, and inspected programmatically. It is the foundation the web UI
and other clients build on (see the [roadmap](roadmap.md)).

```bash
mcst serve                 # listens on http://127.0.0.1:8080, prints a generated token
mcst serve --port 9000 --token my-fixed-token
```

## Security

- Binds `127.0.0.1` by default, so it never listens on a public interface. Override with
  `--host` only if you understand the exposure.
- Every endpoint except the health probe requires the API token, sent as either
  `Authorization: Bearer <token>` or `?token=<token>`. A random token is generated per run
  unless you pass `--token`.
- Starting a run still goes through the same authorization gate as the CLI: the posted
  config must set `authorized: true`, or the request is rejected with `400`.

## Endpoints

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/api` | Health/version probe (no token required). |
| GET | `/api/runs` | List runs and their status. |
| POST | `/api/runs` | Start a run. Body is a full config object. Returns the run record. |
| GET | `/api/runs/:id` | One run's record. |
| GET | `/api/runs/:id/metrics` | Latest metrics snapshot (live while running, final after). |
| GET | `/api/runs/:id/stream` | Server-Sent Events stream of metrics (~1/s) until the run ends. |
| POST | `/api/runs/:id/stop` | Stop a running run early. |
| GET | `/api/configs` | List saved config file names. |
| GET | `/api/configs/:name` | Read one config file (`{ name, content }`). |
| PUT | `/api/configs/:name` | Validate and save a config file. Body: `{ content }`. |
| DELETE | `/api/configs/:name` | Delete a config file. |
| POST | `/api/configs/validate` | Validate config text without saving. Body: `{ content, ext? }`. |
| GET | `/api/history` | List past run reports (newest first). |
| GET | `/api/history/:file` | Read one full run report (JSON). |
| GET | `/api/history/:file/html` | The report rendered as HTML (the same renderer the CLI writes). |
| GET | `/api/schema` | The config JSON Schema plus a flat field descriptor list, both derived from the zod schema. Drives the web UI's generated config form. |

`POST /api/runs` also accepts a `scenario` field (`join-flood`, `sustained-load`, `chat-flood`,
`chunk-thrash`); it is applied as a preset overlay under the rest of the body, exactly as the CLI's
`--scenario` does.

Config file names are restricted to a single safe segment ending in `.yaml`, `.yml`, or
`.json`; report file names to the `mcst-*.json` reports the engine writes.

## Example

```bash
TOKEN=... # printed by `mcst serve`

# Start a run
curl -s -XPOST localhost:8080/api/runs -H "Authorization: Bearer $TOKEN" \
  -d '{"authorized":true,"target":{"host":"127.0.0.1"},"ramp":{"count":50}}'

# Stream its metrics
curl -N localhost:8080/api/runs/<id>/stream?token=$TOKEN
```
