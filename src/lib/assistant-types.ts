export type AssistantProduct = {
  id: string;
  name_ar: string;
  name_en: string;
  price: number;
  unit: string;
  step: number;
  min_qty: number;
  image: string | null;
  in_stock: boolean;
  suggested_qty?: number;
};
