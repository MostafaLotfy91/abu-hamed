import { defineConfig } from "vitest/config";

// Database tests: real Postgres (PGlite) built from supabase/migrations. Run with `npm run test:db`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
