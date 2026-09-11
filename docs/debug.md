# Debug mode & the Bot API

`mcst debug` attaches a single bot to a server and drops you into an interactive console.
It is for developing and inspecting against a live server, not load testing. The same
programmatic surface it drives, the **Bot API**, is what the scripting engine will build on
(see the [roadmap](roadmap.md)).

```bash
mcst debug --host 127.0.0.1 --port 25565 --i-am-authorized
mcst debug --config examples/local.yaml
```

It connects one full (mineflayer) bot, waits for spawn, then reads commands:

```
mcst> pos
1.0, 64.0, -3.0
mcst> goto 10 64 10
arrived near 10.0, 64.0, 10.0
mcst> say hello
> hello
mcst> /time set day
> /time set day
mcst> entities 8
#42 Zombie (mob) 4.1m
mcst> quit
bye
```

## Console commands

| Command | Does |
| ------- | ---- |
| `pos` | Show position. |
| `health` | Show health and food. |
| `say <message>` | Send a chat message. |
| `cmd <command>` / `/<command>` | Run a server command. |
| `look <yaw> <pitch>` | Face a direction (radians). |
| `goto <x> <y> <z>` | Pathfind to a block. |
| `players` | List online players. |
| `entities [radius]` | List nearby entities (default radius 16). |
| `inv` | List inventory. |
| `stop` | Stop moving / cancel pathfinding. |
| `quit` | Disconnect and exit. |

The bot still passes the authorization gate: set `authorized: true` in the config or pass
`--i-am-authorized`.
