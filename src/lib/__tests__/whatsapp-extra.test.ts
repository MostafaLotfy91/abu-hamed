import { describe, expect, it } from "vitest";
import { fillTemplate, isSafeHttpsUrl, isSafeLink, normalizeEgyptPhone, waLink, WA_VARIABLES } from "@/lib/whatsapp";

describe("normalizeEgyptPhone", () => {
  it("accepts all four mobile operator prefixes (010, 011, 012, 015)", () => {
    expect(normalizeEgyptPhone("01012345678")).toBe("201012345678");
    expect(normalizeEgyptPhone("01112345678")).toBe("201112345678");
    expect(normalizeEgyptPhone("01212345678")).toBe("201212345678");
    expect(normalizeEgyptPhone("01512345678")).toBe("201512345678");
  });
  it("accepts +20, 0020 and bare 20 international forms", () => {
    expect(normalizeEgyptPhone("+201012345678")).toBe("201012345678");
    expect(normalizeEgyptPhone("00201012345678")).toBe("201012345678");
    expect(normalizeEgyptPhone("201012345678")).toBe("201012345678");
  });
  it("strips spaces, dashes and brackets", () => {
    expect(normalizeEgyptPhone("010-1234-5678")).toBe("201012345678");
    expect(normalizeEgyptPhone(" (+20) 10 1234 5678 ")).toBe("201012345678");
    expect(normalizeEgyptPhone("0020 115 123 4567")).toBe("201151234567");
  });
  it("accepts Arabic-Indic digits (Arabic keyboard input)", () => {
    expect(normalizeEgyptPhone("٠١٠١٢٣٤٥٦٧٨")).toBe("201012345678");
  });
  it("rejects invalid operator prefixes", () => {
    for (const p of ["01312345678", "01412345678", "01612345678", "01912345678"]) expect(normalizeEgyptPhone(p)).toBeNull();
  });
  it("rejects numbers that are too short or too long", () => {
    expect(normalizeEgyptPhone("0101234567")).toBeNull();
    expect(normalizeEgyptPhone("010123456789")).toBeNull();
    expect(normalizeEgyptPhone("+2010123456789")).toBeNull();
  });
  it("rejects landlines", () => {
    expect(normalizeEgyptPhone("0223456789")).toBeNull();
    expect(normalizeEgyptPhone("+20223456789")).toBeNull();
    expect(normalizeEgyptPhone("0233445566")).toBeNull();
  });
  it("rejects foreign and empty input", () => {
    expect(normalizeEgyptPhone("+966501234567")).toBeNull();
    expect(normalizeEgyptPhone("")).toBeNull();
    expect(normalizeEgyptPhone("abc")).toBeNull();
    expect(normalizeEgyptPhone(null as unknown as string)).toBeNull();
  });
});

describe("fillTemplate", () => {
  const all = { store_name: "Store", product_name: "Shirt", product_url: "https://s.example/p/1", size: "L", color: "Black", order_number: 42 };

  it("fills every documented variable", () => {
    const tpl = WA_VARIABLES.join("|");
    expect(fillTemplate(tpl, all)).toBe("Store|Shirt|https://s.example/p/1|L|Black|42");
  });
  it("replaces missing, null and empty variables with a dash", () => {
    expect(fillTemplate("{size}/{color}/{product_name}", { size: null, color: "" })).toBe("-/-/-");
  });
  it("keeps zero values", () => {
    expect(fillTemplate("#{order_number}", { order_number: 0 })).toBe("#0");
  });
  it("replaces unknown placeholders with a dash too", () => {
    expect(fillTemplate("hi {nope}", {})).toBe("hi -");
  });
  it("replaces repeated placeholders everywhere", () => {
    expect(fillTemplate("{store_name} - {store_name}", { store_name: "A" })).toBe("A - A");
  });
  it("leaves non-placeholder braces alone", () => {
    expect(fillTemplate("{ store_name } {} {a-b}", { store_name: "A" })).toBe("{ store_name } {} {a-b}");
  });
  it("does not re-expand placeholders found inside values", () => {
    expect(fillTemplate("{product_name}", { product_name: "{store_name}", store_name: "X" })).toBe("{store_name}");
  });
  it("does not treat $ patterns in values specially", () => {
    expect(fillTemplate("{product_name}", { product_name: "$& $1 $$" })).toBe("$& $1 $$");
  });
});

describe("waLink", () => {
  it("percent-encodes Arabic text so it round-trips", () => {
    const msg = "مرحباً، أستفسر";
    const link = waLink("201012345678", msg);
    expect(link.startsWith("https://wa.me/201012345678?text=")).toBe(true);
    expect(link).not.toMatch(/[؀-ۿ]/);
    expect(decodeURIComponent(new URL(link).search.slice("?text=".length))).toBe(msg);
    expect(new URL(link).searchParams.get("text")).toBe(msg);
  });
  it("encodes &, #, ? and = so they cannot break the query string", () => {
    expect(waLink("20", "a&b#c?d=e")).toBe("https://wa.me/20?text=a%26b%23c%3Fd%3De");
    expect(new URL(waLink("20", "a&text=evil#x")).searchParams.get("text")).toBe("a&text=evil#x");
  });
  it("encodes newlines and plus signs", () => {
    expect(waLink("20", "a\nb+c")).toBe("https://wa.me/20?text=a%0Ab%2Bc");
  });
});

describe("isSafeHttpsUrl", () => {
  it("accepts https URLs, trimming surrounding whitespace", () => {
    expect(isSafeHttpsUrl("https://instagram.com/store")).toBe(true);
    expect(isSafeHttpsUrl("  https://instagram.com/store  ")).toBe(true);
    expect(isSafeHttpsUrl("HTTPS://EXAMPLE.COM")).toBe(true);
  });
  it("rejects script and data schemes in any case or with leading whitespace", () => {
    for (const u of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "  javascript:alert(1)", "\tjavascript:alert(1)",
      "java\tscript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "file:///etc/passwd"]) {
      expect(isSafeHttpsUrl(u)).toBe(false);
    }
  });
  it("rejects http, protocol-relative and relative URLs", () => {
    expect(isSafeHttpsUrl("http://example.com")).toBe(false);
    expect(isSafeHttpsUrl("//evil.com")).toBe(false);
    expect(isSafeHttpsUrl("/products")).toBe(false);
    expect(isSafeHttpsUrl("")).toBe(false);
  });
  it("rejects https URLs containing spaces, quotes or angle brackets", () => {
    expect(isSafeHttpsUrl("https://example.com/a b")).toBe(false);
    expect(isSafeHttpsUrl('https://example.com/"onmouseover="x')).toBe(false);
    expect(isSafeHttpsUrl("https://example.com/<script>")).toBe(false);
  });
});

describe("isSafeLink", () => {
  it("accepts same-site paths with query and hash", () => {
    expect(isSafeLink("/products?category=men#top")).toBe(true);
    expect(isSafeLink("  /products  ")).toBe(true);
  });
  it("rejects protocol-relative and backslash tricks", () => {
    for (const u of ["//evil.com", "/\\evil.com", "\\\\evil.com", "  //evil.com", "\\/evil.com"]) expect(isSafeLink(u)).toBe(false);
  });
  it("rejects dangerous schemes", () => {
    for (const u of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "data:text/html,x", "vbscript:x", "http://x.com"]) {
      expect(isSafeLink(u)).toBe(false);
    }
  });
  it("rejects paths with spaces, quotes or angle brackets", () => {
    expect(isSafeLink("/a b")).toBe(false);
    expect(isSafeLink('/a"b')).toBe(false);
    expect(isSafeLink("/<script>")).toBe(false);
  });
  it("rejects relative paths without a leading slash", () => {
    expect(isSafeLink("products")).toBe(false);
    expect(isSafeLink("")).toBe(false);
  });
});
