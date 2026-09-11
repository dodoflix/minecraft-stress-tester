# Example configs

Run any of these with `npm start -- --config examples/<file>` (or `npx mcst --config ...`).
They target `127.0.0.1:25565` - spin up a throwaway server first with `npm run server`.

> Only run against servers you own or are permitted to test. Every example sets
> `authorized: true`; keep it that way only for targets you control.

| File | What it shows |
|------|---------------|
| [`local.yaml`](local.yaml) | Every field, commented. Baseline local test. |
| [`minimal.json`](minimal.json) | Smallest valid config (JSON). |
| [`join-flood.yaml`](join-flood.yaml) | Connection flood: many bots, fast, brief. |
| [`sustained-load.yaml`](sustained-load.yaml) | Steady population held for minutes; TUI + HTML report. |
| [`full-movement.yaml`](full-movement.yaml) | FullBot (mineflayer) walking + chunk loading; web dashboard. |
| [`proxied.yaml`](proxied.yaml) | SOCKS5 proxy pool to spread source IPs. |
| [`auto-proxies.yaml`](auto-proxies.yaml) | Fetch + validate free public proxies automatically. |
| [`microsoft-accounts.yaml`](microsoft-accounts.yaml) | Online-mode server with a Microsoft account pool. |
| [`scenario.yaml`](scenario.yaml) | Start from a named scenario, override a field. |
| [`blueprints/greeter.json`](blueprints/greeter.json) | Programmable-bot blueprint (see [docs/scripting.md](../docs/scripting.md)). |

See [docs/usage.md](../docs/usage.md) for all fields and CLI flags.
