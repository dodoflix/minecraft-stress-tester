import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      // Thin I/O shims and networked drivers exercised by the integration test; their
      // pure logic (config loader, dashboard, shard math) is covered directly.
      exclude: ["src/cli.ts", "src/report/tui.ts", "src/drivers/full.ts", "src/engine/sharded.ts"],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
});
