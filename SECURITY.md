# Security & Responsible Use

## Responsible use

This is a load generator. Pointed at a server you do not control, it is a
denial-of-service tool, and running it against such a server is illegal in most
jurisdictions. The project exists for **authorized** capacity testing:

- Only run it against servers you own or have **explicit written permission** to test.
- The tool refuses to start unless you affirm authorization (`authorized: true`
  or `--i-am-authorized`). Do not circumvent this.
- Prefer an allowlisted source IP and an isolated/staging server.

Maintainers will not help with, and will close, any request aimed at attacking a
third-party server.

## Reporting a vulnerability

Report security issues privately via [GitHub Security Advisories](https://github.com/dodoflix/minecraft-stress-tester/security/advisories/new)
rather than a public issue. Include a description, affected version, and repro.
You'll get an acknowledgement within a few days.
