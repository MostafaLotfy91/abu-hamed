import { test, expect } from "./fixtures/test";
import { E2E_READY, SKIP_REASON, SUPABASE_URL } from "./fixtures/env";

test.skip(!E2E_READY, SKIP_REASON);

/*
 * Google sign-in uses Supabase's own OAuth (works on any host). The real Google login can't be automated, so
 * the test checks the hand-off: the button appears only when the provider is enabled, and clicking it sends
 * the browser to Supabase's /authorize for Google with the right return address.
 */
test.describe("sign in with Google", () => {
  test.use({ lang: "ar" });

  test("hidden while Google is not enabled in Supabase", async ({ page }) => {
    await page.route("**/auth/v1/settings", (route) =>
      route.fulfill({ json: { external: { email: true, google: false } } }),
    );
    await page.goto("/auth");
    await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
    await expect(page.getByRole("button", { name: /جوجل|Google/ })).toHaveCount(0);
  });

  test("when enabled, the button hands off to Supabase Google OAuth and returns to the page", async ({
    page,
  }) => {
    await page.route("**/auth/v1/settings", (route) =>
      route.fulfill({ json: { external: { email: true, google: true } } }),
    );
    let authorize = "";
    await page.route("**/auth/v1/authorize**", (route) => {
      authorize = route.request().url();
      return route.fulfill({ contentType: "text/html", body: "<p>google</p>" });
    });
    await page.goto("/auth?redirect=%2Fcheckout");
    await page.getByRole("button", { name: /جوجل|Google/ }).click();
    await expect.poll(() => authorize).toContain(`${SUPABASE_URL}/auth/v1/authorize`);
    const u = new URL(authorize);
    expect(u.searchParams.get("provider")).toBe("google");
    const back = new URL(u.searchParams.get("redirect_to")!);
    expect(back.pathname).toBe("/auth");
    expect(back.searchParams.get("redirect")).toBe("/checkout");
  });
});
