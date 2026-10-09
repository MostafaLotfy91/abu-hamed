import { test, expect } from "./fixtures/test";
import { E2E_READY, SKIP_REASON } from "./fixtures/env";
import { login } from "./fixtures/helpers";

test.skip(!E2E_READY, SKIP_REASON);

test.describe("installable apps", () => {
  test("the storefront links its manifest, named from the store, with working icons", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      "href",
      "/icons/apple-touch-icon.png",
    );
    const res = await request.get("/manifest.webmanifest");
    expect(res.headers()["content-type"]).toContain("application/manifest+json");
    const m = await res.json();
    expect(m).toMatchObject({ start_url: "/", scope: "/", display: "standalone" });
    expect(m.name.length).toBeGreaterThan(0);
    for (const icon of m.icons) expect((await request.get(icon.src)).status()).toBe(200);
  });

  test("the driver app keeps its own manifest, also right after signing in", async ({ page }) => {
    await login(page, "driver", "/driver");
    const manifest = page.locator('link[rel="manifest"]');
    await expect(manifest).toHaveCount(1);
    await expect(manifest).toHaveAttribute("href", "/driver.webmanifest");
  });
});
