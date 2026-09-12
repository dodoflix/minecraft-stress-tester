import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

export default defineConfig({
  // Tests run against source across the workspaces, so a bare `minecraft-stress-tester` /
  // `@mcst/server` import resolves to the sibling package's src, not its built dist.
  resolve: {
    alias: {
      "minecraft-stress-tester": resolve(root, "packages/core/src/index.ts"),
      "@mcst/server": resolve(root, "packages/server/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // core + server hold the pure logic under the 95% gate. @mcst/ui is a browser app (Vite/React),
      // I/O by nature; the logic it must not drift from (the config form descriptor) lives in core.
      include: ["packages/core/src/**/*.ts", "packages/server/src/**/*.ts"],
      // Thin I/O shims and networked drivers exercised by the integration test; their
      // pure logic (config loader, dashboard, shard math) is covered directly.
      exclude: [
        "packages/core/src/cli.ts",
        "packages/core/src/report/tui.ts",
        "packages/core/src/drivers/full.ts",
        "packages/core/src/engine/sharded.ts",
        "packages/core/src/net/proxyConnect.ts",
        "packages/core/src/net/proxyProbe.ts",
        "packages/core/src/report/web.ts",
        "packages/core/src/bot/botApi.ts",
        "packages/core/src/scan/recon.ts",
        "packages/server/src/httpServer.ts",
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
});
