import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/support/empty.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    pool: "forks",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      MIKEE_DB: "memory",
      MIKEE_WORKER: "off",
      MIKEE_DESCRIBE_MEDIA: "off",
      MIKEE_ENCRYPTION_KEY: "0".repeat(64),
      SESSION_SECRET: "test-session-secret-test-session-secret",
      APP_URL: "https://mikee.test",
      ANTHROPIC_API_KEY: "test",
    },
  },
});
