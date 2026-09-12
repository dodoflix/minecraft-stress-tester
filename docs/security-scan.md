# Security scan (defensive)

`mcst scan` is a **defensive, best-effort** scanner: it fingerprints a server you own and
reports likely weaknesses so you can patch them. It is not an attack tool, ships no exploits,
and performs only non-destructive checks. Use it only on servers you are authorized to test
(the authorization gate applies).

```bash
mcst scan --host 127.0.0.1 --port 25565 --i-am-authorized
mcst scan --config examples/local.yaml --deep --json
mcst scan -H play.example.com --deep --probe-versions --i-am-authorized
```

## What it checks

- **Fingerprint** (from the server-list ping): server software (Paper/Spigot/Purpur/Fabric/...),
  Minecraft version, and protocol.
- **Version advisories**: a small curated set of version-range issues (for example, a
  Log4Shell-era version that may be unpatched, or a version older than the supported minimum),
  each with remediation notes.
- **`--deep`** (joins one bot): infers plugins from three signals, each labeled by confidence:
  registered **plugin-message channels** (high), **command namespaces** from a "/" tab-complete
  (`essentials:heal` -> essentials, high; known bare commands, medium), and the server **brand**.
- **`--probe-versions`** (with `--deep`): best-effort plugin versions via read-only `/version`
  commands, parsed from the chat replies. Versions unlock curated plugin advisories and CVE
  matching.
- **osv.dev + curated plugin rules**: for a plugin with a detected version and a known Maven
  coordinate, [osv.dev](https://osv.dev/) is queried for live CVEs; curated version-range rules are
  blended in. Most plugins are not on Maven, so this is best-effort.

Every finding and plugin detection carries a **confidence** (high/medium/low) so you can triage.

## Honest limits

Detection is a floor, not a guarantee. Plugin enumeration can be blocked or hidden, brands can
be spoofed, and advisory data for plugins is thin. Findings marked as heuristics ("verify your
build") mean exactly that. Everything is non-destructive: no exploits, only read-only probes
(status ping, tab-complete, and `/version`). See [SECURITY.md](../SECURITY.md) for the policy.
