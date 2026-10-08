import { describe, expect, it } from "vitest";
import { fillTemplate, waLink } from "@/lib/whatsapp";

// Defaults copied from supabase/migrations/20261006112746_1094fe72-2174-484e-8786-74523daef0ce.sql
const T = {
  general_ar: "مرحباً {store_name}، عندي استفسار",
  general_en: "Hello {store_name}, I have a question",
  product_ar: "مرحباً، أستفسر عن {product_name} (المقاس: {size}، اللون: {color}) {product_url}",
  product_en: "Hi, I'm asking about {product_name} (size: {size}, color: {color}) {product_url}",
  order_ar: "مرحباً، أستفسر عن طلبي رقم #{order_number}",
  order_en: "Hi, I'm asking about my order #{order_number}",
};
const NUM = "201012345678";
const text = (link: string) => new URL(link).searchParams.get("text");

describe("default WhatsApp templates", () => {
  it("general template (ar/en)", () => {
    expect(fillTemplate(T.general_ar, { store_name: "أبو حامد" })).toBe(
      "مرحباً أبو حامد، عندي استفسار",
    );
    expect(fillTemplate(T.general_en, { store_name: "Abu Hamed" })).toBe(
      "Hello Abu Hamed, I have a question",
    );
  });

  it("product template with size and color", () => {
    const vars = {
      product_name: "قميص كتان",
      size: "L",
      color: "أسود",
      product_url: "https://shop.example/products/abc",
    };
    expect(fillTemplate(T.product_ar, vars)).toBe(
      "مرحباً، أستفسر عن قميص كتان (المقاس: L، اللون: أسود) https://shop.example/products/abc",
    );
    expect(
      fillTemplate(T.product_en, { ...vars, product_name: "Linen shirt", color: "Black" }),
    ).toBe(
      "Hi, I'm asking about Linen shirt (size: L, color: Black) https://shop.example/products/abc",
    );
  });

  it("product template before a size/color is chosen shows dashes", () => {
    expect(
      fillTemplate(T.product_en, {
        product_name: "Perfume",
        product_url: "https://shop.example/p",
      }),
    ).toBe("Hi, I'm asking about Perfume (size: -, color: -) https://shop.example/p");
  });

  it("order template (ar/en)", () => {
    expect(fillTemplate(T.order_ar, { order_number: 1042 })).toBe(
      "مرحباً، أستفسر عن طلبي رقم #1042",
    );
    expect(fillTemplate(T.order_en, { order_number: "1042" })).toBe(
      "Hi, I'm asking about my order #1042",
    );
  });

  it("produces wa.me links that decode back to the filled message", () => {
    const msg = fillTemplate(T.order_en, { order_number: 1042 });
    const link = waLink(NUM, msg);
    expect(link).toBe(
      "https://wa.me/201012345678?text=Hi%2C%20I'm%20asking%20about%20my%20order%20%231042",
    );
    expect(text(link)).toBe(msg);

    const ar = fillTemplate(T.product_ar, {
      product_name: "عباية",
      size: "M",
      color: "كحلي",
      product_url: "https://shop.example/products/x?ref=wa&utm=1",
    });
    const arLink = waLink(NUM, ar);
    expect(arLink).not.toContain("#");
    expect(arLink).not.toContain("&utm");
    expect(text(arLink)).toBe(ar);
  });
});
