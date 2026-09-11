# Usage

## Install

```bash
git clone https://github.com/dodoflix/minecraft-stress-tester.git
cd minecraft-stress-tester
npm install
```

## Local test server

Don't have a server to point at? Spin up a throwaway Paper server (offline mode, flat
world, room for 1000 bots) - it downloads on first run into `./.dev-server` (gitignored):

```bash
npm run server                 # needs a JDK (Java 25+); Ctrl+C to stop
```

Then, in another terminal, point the tool at it:

```bash
npm start -- --host 127.0.0.1 --port 25565 --count 50 --i-am-authorized
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

## Scaling to many bots

The client is the bottleneck before the server is, for two reasons:

- **One thread parses everything.** `minecraft-protocol` fully deserializes every inbound
  packet, and Node runs it on a single event loop. A few hundred to ~1-2k light bots
  saturate one CPU core, after which bots lag (slow to spawn, delayed keep-alives) - not
  the server.
- **Clustered bots create O(n²) traffic.** Bots spawn at the same point, so each one
  receives entity updates about every other nearby bot.

To push big numbers without the tool lagging:

- **`--shards N`** - fan the run out across N worker processes (one per core), each a full
  engine on a slice of the count. This is the main lever: `mcst --count 4000 --shards 8`.
- **`--view-distance 2`** (the default) - bots ask the server for a tiny view, so it sends
  far fewer chunk packets per bot. Raise it only when you're specifically testing chunk load.
- **`--mc-version <ver>`** - pin the version so each bot skips its own status ping at connect.

Getting the server (not the client) to be the bottleneck is the goal: a low idle TPS on the
target means the load landed.

## Docker

```bash
docker build -t mcst .
docker run --rm mcst --host host.docker.internal --port 25565 --count 100 --i-am-authorized
# persist reports:  -v "$PWD/reports:/app/reports"
```

## CLI flags

| Flag | Meaning |
|------|---------|
| `-c, --config <path>` | Config file (`.yaml` or `.json`). |
| `-H, --host <host>` | Target host. |
| `-p, --port <port>` | Target port (default 25565). |
| `-n, --count <n>` | Number of bots. |
| `-d, --driver <light\|full>` | `light` = raw protocol (scale); `full` = mineflayer (realistic movement/chunks). |
| `-s, --shards <n>` | Run across N worker processes to get past the single-process ceiling. |
| `--scenario <name>` | Load profile: `join-flood`, `sustained-load`, `chat-flood`, `chunk-thrash`. |
| `--mc-version <ver>` | Force a Minecraft version (default: auto-detect from ping). |
| `--view-distance <n>` | Chunk view distance each bot requests (default 2; lower = lighter client). |
| `--tui` | Full-screen live dashboard instead of console lines. |
| `--web` | Serve a live web dashboard (default `http://localhost:8787`). |
| `--web-port <port>` | Web dashboard port. |
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
