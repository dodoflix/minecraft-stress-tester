# Usage

## Install

```bash
git clone https://github.com/dodoflix/minecraft-stress-tester.git
cd minecraft-stress-tester
npm install
```

## Run

With a config file:

```bash
npm start -- --config examples/local.yaml
```

Or entirely from flags (still requires the authorization affirmation):

```bash
npm start -- --host 127.0.0.1 --port 25565 --count 100 --i-am-authorized
```

Once published: `npx mcst --config run.yaml`.

## CLI flags

| Flag | Meaning |
|------|---------|
| `-c, --config <path>` | Config file (`.yaml` or `.json`). |
| `-H, --host <host>` | Target host. |
| `-p, --port <port>` | Target port (default 25565). |
| `-n, --count <n>` | Number of bots. |
| `-d, --driver <light\|full>` | `light` = raw protocol (scale); `full` = mineflayer (realistic movement/chunks). |
| `-s, --shards <n>` | Run across N worker processes to get past the single-process ceiling. |
| `--mc-version <ver>` | Force a Minecraft version (default: auto-detect from ping). |
| `--tui` | Full-screen live dashboard instead of console lines. |
| `--csv` | Also write a CSV report. |
| `--html` | Also write a self-contained HTML report. |
| `--i-am-authorized` | Affirm you own / may test the target. |

Flags override the config file.

## Config

See [`examples/local.yaml`](../examples/local.yaml) for every field.

## Version selection

By default each bot auto-negotiates the protocol from the server's status ping, so it
matches whatever the server runs (within the versions `minecraft-protocol` supports).
Pin `target.version` to skip the extra per-bot ping at high bot counts.

## Testing against a throwaway server

Don't have a spare server? The integration test provisions one for you:

```bash
npm run test:integration   # downloads latest supported Paper, boots it, runs bots
```

Needs a JDK (Java 25+) on PATH.
