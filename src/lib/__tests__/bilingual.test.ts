import { describe, expect, it } from "vitest";
import { pickLang } from "../bilingual";

describe("pickLang", () => {
  it("picks the half in the admin's language, either order", () => {
    expect(pickLang("Save / حفظ", "ar")).toBe("حفظ");
    expect(pickLang("Save / حفظ", "en")).toBe("Save");
    expect(pickLang("إعدادات المتجر / Store settings", "en")).toBe("Store settings");
    expect(pickLang("Stock (بدون اختيارات فقط) / Stock if no variants", "ar")).toBe(
      "Stock (بدون اختيارات فقط)",
    );
    expect(pickLang("حذف 3 عنصر؟ / Delete 3 items?", "en")).toBe("Delete 3 items?");
  });

  it("leaves everything else alone", () => {
    expect(pickLang("Name (EN)", "ar")).toBe("Name (EN)");
    expect(pickLang("M / L", "ar")).toBe("M / L");
    expect(pickLang("أسود / أبيض", "en")).toBe("أسود / أبيض");
  });
});
