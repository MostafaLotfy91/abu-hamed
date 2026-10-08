/** Excel I/O for product import/export (browser only — SheetJS loaded on demand). */
import { supabase } from "@/integrations/supabase/client";
import { GENDERS, SEASONS, CONCENTRATIONS } from "@/lib/fashion";
import type { Profile } from "@/lib/catalog";
import {
  AR_HEADERS,
  COLUMNS,
  categoryPath,
  neutralizeFormula,
  type CategoryInfo,
  type PaletteColor,
} from "@/lib/product-import";

const loadXlsx = () => import("xlsx");

function download(XLSX: typeof import("xlsx"), wb: import("xlsx").WorkBook, name: string) {
  XLSX.writeFile(wb, name, { compression: true });
}

const INSTRUCTIONS = [
  ["تعليمات استيراد المنتجات"],
  ["• كل صف = مقاس/لون واحد (variant). الصفوف التي لها نفس product_code تكوّن منتجاً واحداً."],
  ["• الأعمدة المطلوبة: product_code, name_ar (في أول صف للمنتج), price."],
  ["• category: مسار القسم مثل «ملابس رجالي > قمصان» كما في شيت Lists."],
  [
    "• size: يجب أن يكون من مقاسات القسم (ملابس S–XXXL، أحذية 36–46، أطفال بالسن). يقبل «لارج» = L.",
  ],
  ["• sku: كود فريد لكل مقاس/لون. لو الكود موجود يتم تحديث السعر والمخزون فقط."],
  [
    "• image_1..image_5: روابط https كاملة، أو أسماء ملفات ثم ارفع الصور من شاشة «رفع الصور» باسم <product_code>_<رقم>.jpg",
  ],
  ["• is_active: 1 أو 0. الأرقام العربية (٠-٩) مقبولة. يمكن استخدام عناوين الأعمدة بالعربي."],
  ["• الحد الأقصى: 5 ميجا و2000 صف. أي خلية تبدأ بـ = أو + تُحفظ كنص فقط."],
];

/** Import template. The example row is neutral; the Lists sheet shows the store's own categories and colours. */
export async function downloadTemplate(
  cats: CategoryInfo[],
  palette: PaletteColor[] = [],
  profiles: Profile[] = [],
) {
  const XLSX = await loadXlsx();
  const example = [
    "SKU-001",
    "قميص قطن",
    "Cotton shirt",
    cats[0] ? categoryPath(cats.find((c) => c.parent_id)?.id ?? cats[0].id, cats) : "",
    "",
    "men",
    "summer",
    "قطن",
    "وصف المنتج",
    "Product description",
    "غسيل على 30",
    450,
    550,
    "أسود",
    "#000000",
    "L",
    "SKU-001-BLK-L",
    10,
    "https://example.com/shirt.jpg",
    "",
    "",
    "",
    "",
    1,
    "",
    "",
    "",
    "",
    "",
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([[...COLUMNS], example]);
  ws["!cols"] = COLUMNS.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ...INSTRUCTIONS,
      [],
      ["العمود", "الاسم بالعربي"],
      ...COLUMNS.map((c) => [c, AR_HEADERS[c]]),
    ]),
    "Instructions",
  );
  // One size column per category profile that has sizes (sizes are validated against the category's profile).
  const sized = profiles.filter((p) => p.sizes?.length);
  const lists: string[][] = [
    [
      "category",
      ...sized.map((p) => `${p.name_en} sizes`),
      "gender",
      "season",
      "color",
      "concentration",
    ],
  ];
  const cols = [
    cats.map((c) => categoryPath(c.id, cats)).sort(),
    ...sized.map((p) => p.sizes ?? []),
    GENDERS.map((g) => g.value),
    SEASONS.map((s) => s.value),
    palette.map((c) => c.ar ?? c.en),
    [...CONCENTRATIONS],
  ];
  const n = Math.max(...cols.map((c) => c.length));
  for (let i = 0; i < n; i++) lists.push(cols.map((c) => c[i] ?? ""));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lists), "Lists");
  download(XLSX, wb, "products-template.xlsx");
}

/** Reads the first sheet as a matrix of raw text values (formulas never evaluated, cached text only). */
export async function readSheet(file: File): Promise<unknown[][]> {
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  const wb = /\.csv$/i.test(file.name)
    ? XLSX.read(new TextDecoder().decode(buf), { type: "string", raw: true })
    : XLSX.read(buf, { cellFormula: false, cellHTML: false });
  const ws = wb.Sheets["Products"] ?? wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
}

async function fetchAll<T>(
  build: (from: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export async function exportProducts(cats: CategoryInfo[]) {
  const XLSX = await loadXlsx();
  type P = Record<string, any> & { product_variants: Record<string, any>[] };
  const products = await fetchAll<P>(
    (f) =>
      supabase
        .from("products")
        .select(
          "sku,name_ar,name_en,category_id,brand,gender,season,material_ar,description_ar,description_en,care_ar,price,old_price,stock,images,is_active,top_notes,middle_notes,base_notes,volume_ml,concentration,product_variants(size,color_ar,color_hex,sku,stock,price,is_active)",
        )
        .order("created_at")
        .range(f, f + 999) as any,
  );
  const rows: unknown[][] = [[...COLUMNS]];
  for (const p of products) {
    const imgs = [0, 1, 2, 3, 4].map((i) => p.images?.[i] ?? "");
    const base = (v: Record<string, any> | null) => [
      p.sku ?? "",
      p.name_ar,
      p.name_en,
      categoryPath(p.category_id, cats),
      p.brand ?? "",
      p.gender ?? "",
      p.season ?? "",
      p.material_ar ?? "",
      p.description_ar ?? "",
      p.description_en ?? "",
      p.care_ar ?? "",
      v?.price ?? p.price,
      p.old_price ?? "",
      v?.color_ar ?? "",
      v?.color_hex ?? "",
      v?.size ?? "",
      v?.sku ?? "",
      v ? v.stock : p.stock,
      ...imgs,
      (v ? v.is_active && p.is_active : p.is_active) ? 1 : 0,
      p.top_notes ?? "",
      p.middle_notes ?? "",
      p.base_notes ?? "",
      p.volume_ml ?? "",
      p.concentration ?? "",
    ];
    if (p.product_variants?.length)
      p.product_variants.forEach((v) => rows.push(base(v).map(neutralizeFormula)));
    else rows.push(base(null).map(neutralizeFormula));
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Products");
  download(XLSX, wb, `products-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function downloadErrorReport(
  rows: { row: number; code: string; status: string; messages: string }[],
) {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["الصف", "كود المنتج", "الحالة", "الرسائل"],
      ...rows.map((r) => [r.row, r.code, r.status, r.messages].map(neutralizeFormula)),
    ]),
    "Errors",
  );
  download(XLSX, wb, "import-errors.xlsx");
}
