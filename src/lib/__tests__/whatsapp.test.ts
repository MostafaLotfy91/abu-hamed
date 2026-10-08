import { describe, expect, it } from "vitest";
import { fillTemplate, isSafeHttpsUrl, isSafeLink, normalizeEgyptPhone, waLink } from "../whatsapp";

describe("whatsapp", () => {
  it("normalizes local Egyptian numbers to 20xxxxxxxxxx", () => {
    expect(normalizeEgyptPhone("01012345678")).toBe("201012345678");
  });
  it("normalizes +20 numbers", () => {
    expect(normalizeEgyptPhone("+20 115 123 4567")).toBe("201151234567");
  });
  it("rejects invalid numbers", () => {
    expect(normalizeEgyptPhone("0131234567")).toBeNull();
  });
  it("fills variables", () => {
    expect(
      fillTemplate("#{order_number} {store_name}", { order_number: 12, store_name: "X" }),
    ).toBe("#12 X");
  });
  it("builds wa.me link", () => {
    expect(waLink("201012345678", "hi there")).toBe("https://wa.me/201012345678?text=hi%20there");
  });
  it("accepts only https URLs", () => {
    expect(isSafeHttpsUrl("https://facebook.com/x")).toBe(true);
    expect(isSafeHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpsUrl("http://facebook.com")).toBe(false);
  });
  it("accepts only same-site paths or https links", () => {
    expect(isSafeLink("/products")).toBe(true);
    expect(isSafeLink("/")).toBe(true);
    expect(isSafeLink("https://example.com/sale")).toBe(true);
    expect(isSafeLink("javascript:alert(1)")).toBe(false);
    expect(isSafeLink("//evil.com")).toBe(false);
    expect(isSafeLink("/\\evil.com")).toBe(false);
    expect(isSafeLink("http://example.com")).toBe(false);
  });
});
