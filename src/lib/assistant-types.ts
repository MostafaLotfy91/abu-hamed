export type AssistantVariant = {
  id: string;
  size: string | null;
  color_ar: string | null;
  color_en: string | null;
  color_hex: string | null;
  price: number;
  stock: number;
};

export type AssistantProduct = {
  id: string;
  name_ar: string;
  name_en: string;
  price: number;
  has_variants: boolean;
  image: string | null;
  in_stock: boolean;
  stock: number;
  size_type: string | null;
  /** Only in-stock active variants. */
  variants: AssistantVariant[];
};

/** NDJSON events streamed by /api/assistant. */
export type AssistantEvent =
  | { type: "text"; delta: string }
  | { type: "products"; items: AssistantProduct[] }
  | { type: "error"; status: number };
