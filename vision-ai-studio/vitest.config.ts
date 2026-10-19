import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.unit.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "integration",
          include: ["packages/*/test/**/*.int.ts"],
          environment: "node",
          testTimeout: 60_000,
          fileParallelism: false,
        },
      },
      {
        test: {
          name: "media",
          include: ["packages/*/test/**/*.media.ts", "apps/*/test/**/*.media.ts"],
          environment: "node",
          testTimeout: 180_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
