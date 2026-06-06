import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Generate the language manifest before any test runs — src/common/
    // localize.ts statically imports it (see gen-language-manifest.cjs).
    globalSetup: ["./test/global-setup.mjs"],
    environment: "node",
    globals: false,
    silent: true,
    // Threads start far cheaper than the default forked processes. The suite's
    // wall time is dominated by per-file worker/environment startup and module
    // re-imports (happy-dom + lit/webawesome/codemirror), not by the assertions
    // themselves, so a lighter worker model is a direct win on the CI runner.
    pool: "threads",
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
});
