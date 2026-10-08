import { test, expect } from "./fixtures/test";
import { E2E_READY, SKIP_REASON } from "./fixtures/env";
import { T, fieldAfterLabel, login, toast } from "./fixtures/helpers";
import { createDeliveredOrder, createPendingOrder, returnRequests } from "./fixtures/seed";

test.skip(!E2E_READY, SKIP_REASON);

test.describe("returns and exchanges (Arabic)", () => {
  test.use({ lang: "ar" });
  const s = T.ar;

  test("customer requests an exchange for one item of a delivered order", async ({
    page,
    catalog,
  }) => {
    const order = await createDeliveredOrder(catalog);
    await login(page, "customer", `/orders/${order.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: `${s.order} #${order.order_number}` }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: s.returnExchange })).toBeVisible();
    await expect(page.getByText("متاح خلال ١٤ يومًا من التوصيل")).toBeVisible();

    await page.getByRole("button", { name: s.requestReturn }).click();
    const dialog = page.getByRole("dialog", { name: s.requestReturn });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: s.exchange, exact: true }).click();
    await fieldAfterLabel(dialog, s.items).selectOption({ label: `${catalog.product.ar} · M` });
    await fieldAfterLabel(dialog, s.reason).fill("المقاس صغير");
    await fieldAfterLabel(dialog, s.exchangePref).fill("L أسود");
    await dialog.getByRole("button", { name: s.submit, exact: true }).click();

    await expect(toast(page, s.saved)).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(`${s.exchange} · ${catalog.product.ar} · M`)).toBeVisible();
    await expect(page.getByText(s.rrRequested, { exact: true })).toBeVisible();

    const rows = await returnRequests(order.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "exchange", status: "requested", reason: "المقاس صغير" });
    expect(rows[0].order_item_id).not.toBeNull();
  });

  test("return section is not offered before the order is delivered", async ({ page, catalog }) => {
    const order = await createPendingOrder(catalog);
    await login(page, "customer", `/orders/${order.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: `${s.order} #${order.order_number}` }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: s.returnExchange })).toHaveCount(0);
    await expect(page.getByRole("button", { name: s.requestReturn })).toHaveCount(0);
  });
});

test.describe("returns and exchanges (English)", () => {
  test.use({ lang: "en" });
  const e = T.en;

  test("customer requests a return for the whole order", async ({ page, catalog }) => {
    const order = await createDeliveredOrder(catalog);
    await login(page, "customer", `/orders/${order.id}`);
    await page.getByRole("button", { name: e.requestReturn }).click();
    const dialog = page.getByRole("dialog", { name: e.requestReturn });
    await dialog.getByRole("button", { name: e.return, exact: true }).click();
    // The exchange-preference field only exists for exchanges.
    await expect(
      dialog.locator(`xpath=.//label[normalize-space(.)="${e.exchangePref}"]`),
    ).toHaveCount(0);
    await expect(fieldAfterLabel(dialog, e.items)).toHaveValue("");
    await fieldAfterLabel(dialog, e.reason).fill("Changed my mind");
    await dialog.getByRole("button", { name: e.submit, exact: true }).click();
    await expect(toast(page, e.saved)).toBeVisible();
    await expect(page.getByText(`${e.return} · ${e.wholeOrder}`)).toBeVisible();

    const rows = await returnRequests(order.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "return", status: "requested", order_item_id: null });
  });
});
