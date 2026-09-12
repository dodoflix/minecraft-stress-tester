# Install and distribution

## npm / npx

The engine and CLI publish as **`minecraft-stress-tester`** (bin: `mcst`). The control-plane server
(`@mcst/server`) and web UI (`@mcst/ui`) publish alongside it.

```bash
# One-off, no install:
npx minecraft-stress-tester --host 127.0.0.1 --count 100 --i-am-authorized

# Global install:
npm i -g minecraft-stress-tester
mcst --host 127.0.0.1 --count 100 --i-am-authorized

# As a library:
npm i minecraft-stress-tester
```

`run`, `debug`, `scan`, and `script` work from `minecraft-stress-tester` alone. `serve` and `gui`
load `@mcst/server` (an optional dependency, pulled automatically by npm); if it is missing the CLI
says so. The container image bundles everything.

## Container (serve / gui)

The published image runs the CLI; pass a subcommand as the container args. `serve`/`gui` bind
localhost by default, which is unreachable from outside the container, so bind `0.0.0.0` to expose
the (still token-gated) API to the host:

```bash
docker run --rm -p 8080:8080 \
  ghcr.io/dodoflix/minecraft-stress-tester gui --host 0.0.0.0

# Persist reports + the Microsoft token cache:
docker run --rm -p 8080:8080 \
  -v "$PWD/reports:/app/reports" -v "$PWD/.mcst-accounts:/app/.mcst-accounts" \
  ghcr.io/dodoflix/minecraft-stress-tester serve --host 0.0.0.0
```

Build it yourself with `docker build -t mcst .`.

## Security posture (every distribution)

- The **authorization gate** is always on: no run starts without `--i-am-authorized` (or
  `authorized: true` in config).
- The control-plane **binds `127.0.0.1` by default** and requires a bearer token. Binding a
  non-local address is an explicit opt-in (`--host 0.0.0.0`) and prints a warning; keep the token
  secret and only do it on a trusted network.
