#!/usr/bin/env node
// Download + run a local Paper server for testing the stress tester.
// Offline mode + flat world + high max-players, so bots can join immediately.
// Server lives in ./.dev-server (gitignored); the world persists between runs.
// Needs a JDK (Java 25+, matching current Paper). Stop with Ctrl+C.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import mc from "minecraft-protocol";

const DIR = ".dev-server";
const PORT = Number(process.env.MCST_DEV_PORT ?? 25565);
const PAPER_API = "https://fill.papermc.io/v3/projects/paper";
const UA = "mcst-dev-server";
const majorMinor = (v) => v.split(".").slice(0, 2).join(".");

async function resolveLatest() {
  const supported = new Set(mc.supportedVersions);
  const compatible = (v) => supported.has(v) || supported.has(majorMinor(v));
  const versions = await (await fetch(PAPER_API, { headers: { "User-Agent": UA } })).json();
  const all = Array.isArray(versions.versions)
    ? versions.versions
    : Object.values(versions.versions ?? {}).flat();
  const version = all.find((v) => /^\d+(\.\d+)*$/.test(v) && compatible(v));
  if (!version) throw new Error("No Paper release is supported by minecraft-protocol");
  const builds = await (await fetch(`${PAPER_API}/versions/${version}/builds`, { headers: { "User-Agent": UA } })).json();
  const list = Array.isArray(builds) ? builds : (builds.builds ?? []);
  const build = list.find((b) => b.channel === "STABLE") ?? list[0];
  const dl = build.downloads["server:default"];
  return { version, url: dl.url, sha256: dl.checksums.sha256 };
}

async function provision() {
  mkdirSync(DIR, { recursive: true });
  const jar = join(DIR, "paper.jar");
  const { version, url, sha256 } = await resolveLatest();
  const cached = existsSync(jar) && createHash("sha256").update(readFileSync(jar)).digest("hex") === sha256;
  if (!cached) {
    process.stdout.write(`Downloading Paper ${version} ...\n`);
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    writeFileSync(jar, Buffer.from(await res.arrayBuffer()));
  }
  if (!existsSync(join(DIR, "eula.txt"))) writeFileSync(join(DIR, "eula.txt"), "eula=true\n");
  if (!existsSync(join(DIR, "server.properties"))) {
    writeFileSync(
      join(DIR, "server.properties"),
      [
        "online-mode=false", // offline so stress-test bots can join without accounts
        `server-port=${PORT}`,
        "max-players=1000",
        "level-type=minecraft:flat",
        "view-distance=6",
        "simulation-distance=6",
        "spawn-protection=0",
        "motd=mcst dev server (authorized testing only)",
        "",
      ].join("\n"),
    );
  }
  return version;
}

const version = await provision();
process.stdout.write(
  `\nStarting Paper ${version} on localhost:${PORT} (offline mode). Ctrl+C to stop.\n` +
    `Test it from another terminal, e.g.:\n` +
    `  npm start -- --host 127.0.0.1 --port ${PORT} --count 50 --i-am-authorized\n\n`,
);
const proc = spawn("java", ["-Xms1G", "-Xmx2G", "-XX:+UseG1GC", "-jar", "paper.jar", "--nogui"], {
  cwd: DIR,
  stdio: "inherit",
});
proc.on("error", (err) => {
  process.stderr.write(`\nCould not start Java: ${err.message}\nPaper ${version} needs a JDK (Java 25+).\n`);
  process.exit(1);
});
proc.on("exit", (code) => process.exit(code ?? 0));
