import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    include: ["tests/**/*.test.ts"],
    reporters: ["default", "./tests/reporters/markdown-reporter.ts"],
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      include: ["src/app/api/**/*.ts", "src/lib/**/*.ts"],
      exclude: ["**/*.test.ts", "src/lib/i18n/**"],
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "test-reports/coverage",
    },
  },
});
