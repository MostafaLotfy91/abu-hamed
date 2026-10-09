// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv, type Plugin } from "vite";

/**
 * Production builds need the store's Supabase project. Without these the deployed site starts and then fails
 * every page ("This page didn't load"), so stop the build here with a clear message instead.
 * Set them in the host's environment variables (Vercel: Project → Settings → Environment Variables).
 */
const REQUIRED_AT_BUILD = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];
const requireStoreEnv = (): Plugin => ({
  name: "require-store-env",
  apply: "build",
  config(_c, { mode }) {
    const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
    const missing = REQUIRED_AT_BUILD.filter((k) => !String(env[k] ?? "").trim());
    if (missing.length)
      throw new Error(
        `Missing environment variable(s): ${missing.join(", ")}. ` +
          "Add them in your host's settings (Vercel: Project → Settings → Environment Variables, " +
          "for Production and Preview), then redeploy. See .env.example and docs/launch-checklist.md.",
      );
  },
});

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [requireStoreEnv()],
    server: {
      // Test output (Playwright traces contain .html files) must not trigger dev-server page reloads,
      // or E2E runs reload the page under test mid-step.
      watch: { ignored: ["**/tests/e2e/.results/**", "**/tests/e2e/.report/**", "**/.output/**"] },
    },
  },
});
