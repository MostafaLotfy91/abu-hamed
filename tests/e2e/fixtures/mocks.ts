/**
 * Fake AI responses in the exact wire format the clients parse:
 * NDJSON (one JSON event per line, "\n"-terminated) — see src/lib/assistant.server.ts / assistant-types.ts
 * and src/lib/insights-types.ts.
 */
import type { AssistantEvent, AssistantProduct } from "../../../src/lib/assistant-types";
import type { InsightEvent } from "../../../src/lib/insights-types";
import type { Catalog } from "./seed";

export const assistantStream = (events: AssistantEvent[]) =>
  events.map((e) => JSON.stringify(e) + "\n").join("");
export const insightsStream = (events: InsightEvent[]) =>
  events.map((e) => JSON.stringify(e) + "\n").join("");

/** Product card payload for the seeded shirt, built like toProduct() on the server (in-stock variants only). */
export function assistantProductFor(cat: Catalog): AssistantProduct {
  const v = (size: "M" | "L") => ({
    id: cat.variants[size],
    size,
    color_ar: cat.color.ar,
    color_en: cat.color.en,
    color_hex: cat.color.hex,
    price: cat.price,
    stock: 5,
  });
  return {
    id: cat.productId,
    name_ar: cat.product.ar,
    name_en: cat.product.en,
    price: cat.price,
    has_variants: true,
    image: null,
    in_stock: true,
    stock: 10,
    size_type: null,
    variants: [v("M"), v("L")],
  };
}

/** 1x1 transparent PNG (map tile stub). */
export const ONE_PX_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
