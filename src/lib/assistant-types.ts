export type AssistantProduct = {
  id: string;
  name_ar: string;
  name_en: string;
  price: number;
  has_variants: boolean;
  image: string | null;
  in_stock: boolean;
  suggested_qty?: number;
};
