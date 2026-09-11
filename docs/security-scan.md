# Security scan (defensive)

`mcst scan` is a **defensive, best-effort** scanner: it fingerprints a server you own and
reports likely weaknesses so you can patch them. It is not an attack tool, ships no exploits,
and performs only non-destructive checks. Use it only on servers you are authorized to test
(the authorization gate applies).

```bash
mcst scan --host 127.0.0.1 --port 25565 --i-am-authorized
mcst scan --config examples/local.yaml --deep --json
```

## What it checks

- **Fingerprint** (from the server-list ping): server software (Paper/Spigot/Purpur/Fabric/...),
  Minecraft version, and protocol.
- **Version advisories**: a small curated set of version-range issues (for example, a
  Log4Shell-era version that may be unpatched, or a version older than the supported minimum),
  each with remediation notes.
- **osv.dev**: the [osv.dev](https://osv.dev/) API is queried for any Maven package/version the
  scan can identify. Most Minecraft plugins are not published to Maven, so this is best-effort.
- **`--deep`**: joins one bot to read the server brand and tab-complete the command list, then
  infers likely plugins from command namespaces (`essentials:heal` -> EssentialsX, ...).

## Honest limits

Detection is a floor, not a guarantee. Plugin enumeration can be blocked or hidden, brands can
be spoofed, and advisory data for plugins is thin. Findings marked as heuristics ("verify your
build") mean exactly that. See [SECURITY.md](../SECURITY.md) for the responsible-use policy.
