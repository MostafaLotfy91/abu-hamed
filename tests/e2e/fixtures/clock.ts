/**
 * Test-machine clock compensation. Supabase sessions break when the device clock is far off (fresh tokens
 * look expired, the client refreshes until the server revokes the session). If this machine's clock differs
 * from the Supabase server's by more than two minutes, browser contexts get the server's time instead.
 * Real users are unaffected; the app itself warns users whose clock is wrong.
 */
import type { BrowserContext } from "@playwright/test";
import { SUPABASE_URL } from "./env";

let skewMs: Promise<number> | null = null;

/** Local clock minus server clock, in ms (0 when it can't be measured). */
export function measureSkew(): Promise<number> {
  skewMs ??= (async () => {
    if (!SUPABASE_URL) return 0;
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { method: "GET" });
      const date = res.headers.get("date");
      if (!date) return 0;
      const skew = Date.now() - new Date(date).getTime();
      if (Math.abs(skew) > 2 * 60_000) {
        console.warn(
          `[e2e] This machine's clock is off by ${Math.round(skew / 60_000)} min vs the Supabase server; browser clocks are corrected for the tests. Fix the system time (automatic sync).`,
        );
      }
      return skew;
    } catch {
      return 0;
    }
  })();
  return skewMs;
}

/** Puts the browser context on server time when the machine clock is off by more than two minutes. */
export async function alignClock(context: BrowserContext) {
  const skew = await measureSkew();
  if (Math.abs(skew) > 2 * 60_000)
    await context.clock.install({ time: new Date(Date.now() - skew) });
}
