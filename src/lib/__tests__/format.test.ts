import { describe, expect, it } from "vitest";
import { deliveryFeeFor, effectivePrice, formatMoney, formatQty } from "@/lib/format";

const EGP = { ar: "ج.م", en: "EGP" };

describe("formatMoney", () => {
  it("uses Arabic-Indic digits with the symbol after in Arabic", () => {
    expect(formatMoney(1234, "ar", EGP)).toBe("١٬٢٣٤ ج.م");
  });
  it("puts the symbol before in English", () => {
    expect(formatMoney(1234, "en", EGP)).toBe("EGP 1,234");
  });
  it("shows no decimals for integers and two decimals otherwise", () => {
    expect(formatMoney(250, "en", EGP)).toBe("EGP 250");
    expect(formatMoney(12.5, "en", EGP)).toBe("EGP 12.50");
    expect(formatMoney(12.5, "ar", EGP)).toBe("١٢٫٥٠ ج.م");
    expect(formatMoney(9.999, "en", EGP)).toBe("EGP 10.00");
  });
  it("treats null and undefined as zero", () => {
    expect(formatMoney(null, "en", EGP)).toBe("EGP 0");
    expect(formatMoney(undefined, "ar", EGP)).toBe("٠ ج.م");
  });
  it("accepts numeric strings (as returned by Postgres numeric)", () => {
    expect(formatMoney("450.00", "en", EGP)).toBe("EGP 450");
    expect(formatMoney("99.9", "en", EGP)).toBe("EGP 99.90");
  });
  it("falls back to an empty symbol when the store has none", () => {
    expect(formatMoney(5, "en", { ar: "ج.م" })).toBe(" 5");
    expect(formatMoney(5, "ar", { ar: null, en: "EGP" })).toBe("٥ ");
  });
});

describe("formatQty", () => {
  it("formats with up to 3 decimals in each language", () => {
    expect(formatQty(1.2345, "en")).toBe("1.235");
    expect(formatQty(1.2345, "ar")).toBe("١٫٢٣٥");
    expect(formatQty(1000, "en")).toBe("1,000");
    expect(formatQty(3, "ar")).toBe("٣");
  });
});

describe("effectivePrice", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");
  const future = "2026-10-09T00:00:00Z";
  const past = "2026-10-07T00:00:00Z";

  it("uses the plain price with no discount", () => {
    expect(effectivePrice({ price: 100 }, now)).toEqual({ current: 100, was: null, pct: 0, flashActive: false });
  });
  it("uses old_price as the 'was' price", () => {
    expect(effectivePrice({ price: 75, old_price: 100 }, now)).toEqual({ current: 75, was: 100, pct: 25, flashActive: false });
  });
  it("ignores old_price that is not higher than the price", () => {
    expect(effectivePrice({ price: 100, old_price: 100 }, now).was).toBeNull();
    expect(effectivePrice({ price: 100, old_price: 80 }, now).was).toBeNull();
    expect(effectivePrice({ price: 100, old_price: 80 }, now).pct).toBe(0);
  });
  it("uses the flash price while active, with the regular price as 'was'", () => {
    expect(effectivePrice({ price: 200, flash_price: 150, flash_ends_at: future }, now)).toEqual({ current: 150, was: 200, pct: 25, flashActive: true });
  });
  it("uses the higher of price and old_price as 'was' during a flash sale", () => {
    expect(effectivePrice({ price: 200, old_price: 300, flash_price: 150, flash_ends_at: future }, now).was).toBe(300);
    expect(effectivePrice({ price: 200, old_price: 100, flash_price: 150, flash_ends_at: future }, now).was).toBe(200);
  });
  it("ignores an expired flash sale", () => {
    expect(effectivePrice({ price: 200, flash_price: 150, flash_ends_at: past }, now)).toEqual({ current: 200, was: null, pct: 0, flashActive: false });
  });
  it("treats a flash sale ending exactly now as expired", () => {
    expect(effectivePrice({ price: 200, flash_price: 150, flash_ends_at: new Date(now).toISOString() }, now).flashActive).toBe(false);
  });
  it("ignores a flash price without an end date", () => {
    expect(effectivePrice({ price: 200, flash_price: 150, flash_ends_at: null }, now).flashActive).toBe(false);
    expect(effectivePrice({ price: 200, flash_price: 150, flash_ends_at: null }, now).current).toBe(200);
  });
  it("ignores an end date without a flash price", () => {
    expect(effectivePrice({ price: 200, flash_price: null, flash_ends_at: future }, now).current).toBe(200);
  });
  it("rounds the discount percentage", () => {
    expect(effectivePrice({ price: 200, old_price: 300 }, now).pct).toBe(33);
    expect(effectivePrice({ price: 100, old_price: 300 }, now).pct).toBe(67);
    expect(effectivePrice({ price: 199, old_price: 200 }, now).pct).toBe(1);
  });
  it("accepts numeric strings", () => {
    expect(effectivePrice({ price: "80.00", old_price: "100.00" }, now)).toEqual({ current: 80, was: 100, pct: 20, flashActive: false });
  });
  it("shows no 'was' when the flash price is not a reduction", () => {
    expect(effectivePrice({ price: 100, flash_price: 120, flash_ends_at: future }, now)).toMatchObject({ current: 120, was: null, pct: 0 });
  });
});

describe("deliveryFeeFor", () => {
  it("always charges the fee when there is no free threshold", () => {
    expect(deliveryFeeFor(10_000, 50, null)).toBe(50);
  });
  it("is free when the subtotal equals the threshold", () => {
    expect(deliveryFeeFor(1000, 50, 1000)).toBe(0);
  });
  it("is free above the threshold", () => {
    expect(deliveryFeeFor(1500, 50, 1000)).toBe(0);
  });
  it("charges the fee below the threshold", () => {
    expect(deliveryFeeFor(999.99, 50, 1000)).toBe(50);
  });
  it("a zero threshold makes delivery always free", () => {
    expect(deliveryFeeFor(0, 50, 0)).toBe(0);
  });
});
