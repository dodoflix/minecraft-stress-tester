import { type ChildProcess, execSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mc from "minecraft-protocol";

const PAPER_API = "https://fill.papermc.io/v3/projects/paper";
const UA = "minecraft-stress-tester-ci";
const CACHE_DIR = join(process.cwd(), ".mcst-cache");

export interface RealServer {
  port: number;
  version: string;
  close: () => Promise<void>;
}

export function javaAvailable(): boolean {
  try {
    execSync("java -version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const majorMinor = (v: string): string => v.split(".").slice(0, 2).join(".");

/** Newest Paper stable release whose protocol minecraft-protocol's *client* can speak. */
async function resolveLatest(): Promise<{ version: string; url: string; sha256: string; jarName: string }> {
  // Client codec support (mc.supportedVersions), NOT just bundled data — the two differ
  // at the bleeding edge (e.g. 26.2 has data but no client codec in mc-protocol 1.68).
  const supported = new Set<string>(mc.supportedVersions);
  const isCompatible = (v: string) => supported.has(v) || supported.has(majorMinor(v));

  const versionsRes = await fetch(PAPER_API, { headers: { "User-Agent": UA } });
  const versionsJson: any = await versionsRes.json();
  const all: string[] = Array.isArray(versionsJson.versions)
    ? versionsJson.versions
    : (Object.values(versionsJson.versions ?? {}).flat() as string[]);

  const version = all.find((v) => /^\d+(\.\d+)*$/.test(v) && isCompatible(v));
  if (!version) throw new Error("No Paper stable release is supported by minecraft-protocol");

  const buildsRes = await fetch(`${PAPER_API}/versions/${version}/builds`, { headers: { "User-Agent": UA } });
  const builds: any = await buildsRes.json();
  const list: any[] = Array.isArray(builds) ? builds : (builds.builds ?? []);
  const stable = list.find((b) => b.channel === "STABLE") ?? list[0];
  const dl = stable.downloads["server:default"];
  return { version, url: dl.url, sha256: dl.checksums.sha256, jarName: dl.name };
}

async function provisionJar(): Promise<{ jarPath: string; version: string }> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const { version, url, sha256, jarName } = await resolveLatest();
  const jarPath = join(CACHE_DIR, jarName);

  if (existsSync(jarPath) && createHash("sha256").update(readFileSync(jarPath)).digest("hex") === sha256) {
    return { jarPath, version };
  }
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Paper jar download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = createHash("sha256").update(buf).digest("hex");
  if (got !== sha256) throw new Error(`Paper jar checksum mismatch: ${got} != ${sha256}`);
  writeFileSync(jarPath, buf);
  return { jarPath, version };
}

/** Ready = the server answers a status ping (TCP-open alone is too early on Paper). */
function waitForPing(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      mc.ping({ host: "127.0.0.1", port, version: false } as any, (err) => {
        if (!err) return resolve();
        if (Date.now() > deadline) reject(new Error(`server not ready on :${port} within ${timeoutMs}ms`));
        else setTimeout(attempt, 2000);
      });
    };
    attempt();
  });
}

/** Provision (cached) + boot a real offline Paper server on a flat world. */
export async function startRealServer(opts: { readyTimeoutMs?: number } = {}): Promise<RealServer> {
  if (!javaAvailable()) throw new Error("java not found — cannot start a real Minecraft server");
  const { jarPath, version } = await provisionJar();

  const port = 30000 + Math.floor(Math.random() * 20000);
  const dir = join(tmpdir(), `mcst-server-${port}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "eula.txt"), "eula=true\n");
  writeFileSync(
    join(dir, "server.properties"),
    [
      "online-mode=false",
      `server-port=${port}`,
      "level-type=minecraft:flat",
      "view-distance=4",
      "simulation-distance=4",
      "spawn-protection=0",
      "max-players=200",
      "network-compression-threshold=-1",
      "sync-chunk-writes=false",
      "motd=mcst-real-test",
      "",
    ].join("\n"),
  );

  const proc: ChildProcess = spawn("java", ["-Xms1G", "-Xmx2G", "-XX:+UseG1GC", "-jar", jarPath, "--nogui"], {
    cwd: dir,
    stdio: "ignore",
  });
  proc.on("error", (e) => {
    throw e;
  });

  // Cold Paper boot on CI (JVM start + world gen) can exceed two minutes.
  await waitForPing(port, opts.readyTimeoutMs ?? 240000);

  return {
    port,
    version,
    close: () =>
      new Promise<void>((resolve) => {
        const done = () => {
          try {
            rmSync(dir, { recursive: true, force: true });
          } catch {
            /* best effort */
          }
          resolve();
        };
        if (proc.exitCode !== null || proc.killed) return done();
        proc.once("exit", done);
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (proc.exitCode === null) proc.kill("SIGKILL");
        }, 8000);
      }),
  };
}
