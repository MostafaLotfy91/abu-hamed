import { test, expect } from "./fixtures/test";
import { E2E_READY, SKIP_REASON } from "./fixtures/env";
import { toast } from "./fixtures/helpers";
import { deletePhoneAccount } from "./fixtures/seed";

test.skip(!E2E_READY, SKIP_REASON);

/* Phone number + password: no SMS code. Each run uses a fresh number and deletes the account afterwards. */
test.describe("phone + password login", () => {
  test.use({ lang: "ar" });

  test("sign up, see the phone on the account page, sign out, sign in again; clear errors", async ({
    page,
  }, info) => {
    const local = `0109${String(Date.now()).slice(-6)}${info.project.name.startsWith("mobile") ? "1" : "2"}`;
    const normalized = `2${local}`;
    const password = `Pw-${Date.now()}`;
    const phoneTab = () => page.getByRole("tab", { name: "رقم الموبايل" });
    const form = () => page.getByRole("tabpanel", { name: "رقم الموبايل" });
    try {
      // Sign up
      await page.goto("/auth?redirect=%2Faccount");
      await phoneTab().click();
      await form().getByRole("button", { name: "إنشاء حساب" }).click();
      await form().getByLabel("الاسم بالكامل").fill("عميل موبايل");
      await form().getByLabel("رقم الموبايل").fill(local);
      await form().getByLabel("كلمة المرور").fill(password);
      await form().getByRole("button", { name: "إنشاء حساب" }).first().click();
      await expect(page).toHaveURL(/\/account$/, { timeout: 20_000 });
      // The account shows the phone, never the internal login address.
      await expect(page.getByText(local)).toBeVisible();
      await expect(page.getByText("phone.local")).toHaveCount(0);

      // Sign out, then sign in with phone + password
      await page.getByRole("button", { name: "تسجيل الخروج" }).click();
      await page.goto("/auth?redirect=%2Faccount");
      await phoneTab().click();
      await form()
        .getByLabel("رقم الموبايل")
        .fill(`+20 ${local.slice(1)}`); // any common format works
      await form().getByLabel("كلمة المرور").fill("wrong-password");
      await form().getByRole("button", { name: "تسجيل الدخول" }).click();
      await expect(toast(page, "رقم الموبايل أو كلمة المرور غير صحيحة")).toBeVisible();
      await form().getByLabel("كلمة المرور").fill(password);
      await form().getByRole("button", { name: "تسجيل الدخول" }).click();
      await expect(page).toHaveURL(/\/account$/, { timeout: 20_000 });

      // The same number can't be registered twice.
      await page.getByRole("button", { name: "تسجيل الخروج" }).click();
      await page.goto("/auth");
      await phoneTab().click();
      await form().getByRole("button", { name: "إنشاء حساب" }).click();
      await form().getByLabel("الاسم بالكامل").fill("تاني");
      await form().getByLabel("رقم الموبايل").fill(local);
      await form().getByLabel("كلمة المرور").fill(password);
      await form().getByRole("button", { name: "إنشاء حساب" }).first().click();
      await expect(toast(page, "الرقم ده عليه حساب بالفعل")).toBeVisible();
    } finally {
      await deletePhoneAccount(normalized);
    }
  });
});
