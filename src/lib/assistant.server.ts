import { streamText, tool, isStepCount, type ModelMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { effectivePrice } from "./format";
import { checkRateLimit, rateLimitResponse, visitorKey } from "./rate-limit.server";
import type { AssistantEvent, AssistantProduct } from "./assistant-types";
import { aiConfig, aiModel, missingAiSettings, serverSupabaseEnv } from "./ai-provider.server";

export type { AssistantProduct };

const MAX_HISTORY = 12;
const MAX_CHARS = 1000;

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) }))
    .min(1)
    .max(60),
});

const COLS =
  "id,name_ar,name_en,brand,price,old_price,flash_price,flash_ends_at,stock,images,thumbnails,gender,season,size_type,category_id,product_variants(id,size,color_ar,color_en,color_hex,price,stock,is_active)";

type VariantRow = {
  id: string;
  size: string | null;
  color_ar: string | null;
  color_en: string | null;
  color_hex: string | null;
  price: number | null;
  stock: number;
  is_active: boolean;
};
type ProductRow = Parameters<typeof effectivePrice>[0] & {
  id: string;
  name_ar: string;
  name_en: string;
  stock: number;
  images: string[] | null;
  thumbnails: string[] | null;
  size_type: string | null;
  product_variants: VariantRow[] | null;
};

function toProduct(r: ProductRow): AssistantProduct {
  const base = effectivePrice(r).current;
  const all = (r.product_variants ?? []).filter((v) => v.is_active);
  const variants = all
    .filter((v) => Number(v.stock) > 0)
    .map((v) => ({
      id: v.id,
      size: v.size,
      color_ar: v.color_ar,
      color_en: v.color_en,
      color_hex: v.color_hex,
      price: v.price != null ? Number(v.price) : base,
      stock: Number(v.stock),
    }));
  const has_variants = all.length > 0;
  return {
    id: r.id,
    name_ar: r.name_ar,
    name_en: r.name_en,
    price: base,
    image: r.thumbnails?.[0] ?? r.images?.[0] ?? null,
    has_variants,
    variants,
    size_type: r.size_type ?? null,
    stock: Number(r.stock),
    in_stock: has_variants ? variants.length > 0 : Number(r.stock) > 0,
  };
}

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const clean = (s: string) =>
  s
    .replace(/[%,()*]/g, " ")
    .trim()
    .slice(0, 60);

const SIZE_GUIDE = `دليل المقاسات (سم): ملابس كبار حسب محيط الصدر: S 88–94، M 95–101، L 102–108، XL 109–115، XXL 116–122، XXXL 123–129. تقريب بالوزن (للمعلومة فقط): أقل من 60كجم S، 60–70 M، 70–80 L، 80–90 XL، 90–100 XXL، أكثر من 100 XXXL. الأحذية 36–46 (طول القدم تقريباً 22.5سم للمقاس 36 ويزيد 0.65سم لكل مقاس). الأطفال بالسن/الطول: 3-4y 98–104، 4-5y 104–110، 5-6y 110–116، 6-7y 116–122، 7-8y 122–128، 8-10y 128–140، 10-12y 140–152، 12-14y 152–164.`;

export async function handleAssistant(request: Request): Promise<Response> {
  const ai = aiConfig();
  const { url, anon } = serverSupabaseEnv();
  // 503 + the names of the missing settings (never their values) so the host's config is easy to fix.
  if (!ai || !url || !anon) return json(503, { error: "config", missing: missingAiSettings() });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return json(400, { error: "bad_request" });
  }
  // Cap history and length before anything reaches the model.
  const messages = body.messages
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));

  const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: settings } = await db
    .from("store_settings")
    .select("features,name_ar,name_en,currency_symbol_ar,whatsapp_number,contact_phone")
    .limit(1)
    .maybeSingle();
  const s = settings as {
    features?: { ai_assistant?: boolean };
    name_ar?: string | null;
    name_en?: string | null;
    currency_symbol_ar?: string | null;
    whatsapp_number?: string | null;
    contact_phone?: string | null;
  } | null;
  if (!s?.features?.ai_assistant) return json(403, { error: "disabled" });

  // Rate limit + anonymous usage log; refuses the request if the check can't run.
  const limited = rateLimitResponse(await checkRateLimit(visitorKey(request), messages.length));
  if (limited) return limited;

  const seen = new Map<string, AssistantProduct>();
  const suggested = new Map<string, AssistantProduct>();

  const tools = {
    search_products: tool({
      description:
        "Search the store catalog. All filters optional. Use one item type per call (e.g. keywords 'قميص', 'بنطلون', 'جزمة', 'عطر'). Returns only in-stock sizes/colors.",
      inputSchema: z.object({
        keywords: z.string().optional().describe("Short Arabic or English keyword"),
        category: z.string().optional().describe("Department/category name keyword"),
        gender: z.enum(["men", "women", "kids", "unisex"]).optional(),
        size: z.string().optional().describe("e.g. L, 42, 6-7y"),
        color: z.string().optional().describe("Color name in Arabic or English"),
        min_price: z.number().optional(),
        max_price: z.number().optional(),
        season: z.enum(["summer", "winter", "all"]).optional(),
      }),
      execute: async (f) => {
        let q = db.from("products").select(COLS).eq("is_active", true);
        if (f.keywords && clean(f.keywords)) {
          const k = clean(f.keywords);
          q = q.or(
            `name_ar.ilike.%${k}%,name_en.ilike.%${k}%,brand.ilike.%${k}%,description_ar.ilike.%${k}%`,
          );
        }
        if (f.category && clean(f.category)) {
          const c = clean(f.category);
          const { data: cats } = await db
            .from("categories")
            .select("id,parent_id")
            .or(`name_ar.ilike.%${c}%,name_en.ilike.%${c}%`);
          const ids = new Set((cats ?? []).map((x: { id: string }) => x.id));
          if (ids.size) {
            const { data: kids } = await db
              .from("categories")
              .select("id")
              .in("parent_id", [...ids]);
            (kids ?? []).forEach((x: { id: string }) => ids.add(x.id));
            q = q.in("category_id", [...ids]);
          }
        }
        if (f.gender) q = q.in("gender", [f.gender, "unisex"]);
        if (f.season && f.season !== "all") q = q.in("season", [f.season, "all"]);
        const { data } = await q.limit(40);
        const color = f.color?.trim().toLowerCase();
        const size = f.size?.trim().toLowerCase();
        let list = (data ?? []).map(toProduct).filter((p) => p.in_stock);
        if (size || color) {
          list = list
            .map((p) => {
              if (!p.has_variants) return size ? null : p;
              const v = p.variants.filter(
                (x) =>
                  (!size || x.size?.toLowerCase() === size) &&
                  (!color ||
                    x.color_ar?.toLowerCase().includes(color) ||
                    x.color_en?.toLowerCase().includes(color)),
              );
              return v.length ? { ...p, variants: v } : null;
            })
            .filter(Boolean) as AssistantProduct[];
        }
        if (f.min_price != null) list = list.filter((p) => p.price >= f.min_price!);
        if (f.max_price != null) list = list.filter((p) => p.price <= f.max_price!);
        list = list.slice(0, 8);
        list.forEach((p) => seen.set(p.id, p));
        return list.map((p) => ({
          id: p.id,
          name: p.name_ar,
          price: p.price,
          sizes_in_stock: [...new Set(p.variants.map((v) => v.size).filter(Boolean))],
          colors_in_stock: [...new Set(p.variants.map((v) => v.color_ar).filter(Boolean))],
        }));
      },
    }),
    suggest_items: tool({
      description:
        "Show product cards (with add-to-cart) to the customer. Only use ids returned by search_products.",
      inputSchema: z.object({ product_ids: z.array(z.string()) }),
      execute: async ({ product_ids }) => {
        const rejected: string[] = [];
        for (const id of product_ids.slice(0, 12)) {
          const p = seen.get(id);
          if (p) suggested.set(id, p);
          else rejected.push(id);
        }
        return { shown: suggested.size, rejected_unknown_ids: rejected };
      },
    }),
  };

  const contact = s?.whatsapp_number || s?.contact_phone;
  const instructions = `أنت ستايلست ومساعد تسوق ودود لمتجر "${s?.name_ar ?? "المتجر"}" (${s?.name_en ?? ""}).
- رد بنفس لغة العميل؛ الافتراضي العربية بلهجة مصرية بسيطة ومهذبة، وباختصار.
- لا تذكر أي منتج أو سعر أو مقاس أو لون أو توفر إلا لو رجع من search_products. ممنوع الاختراع. لو مفيش حاجة مناسبة قول بصراحة.
- رشّح المقاسات والألوان المتوفرة فقط.
- احترم الميزانية اللي العميل ذكرها (استخدم max_price).
- تقدر تبني أطقم كاملة (مثلاً طقم فرح: قميص + بنطلون + جزمة + إكسسوار؛ جلابية وشبشب للعيد): ابحث عن كل قطعة لوحدها ثم استدعِ suggest_items بكل المنتجات المختارة مرة واحدة.
- تقدر تقترح هدايا (عطور، إكسسوارات).
- مساعدة المقاس: اسأل عن الطول والوزن أو المقاس المعتاد، ثم اقترح مقاس من الدليل ده، وفكّر العميل دايماً يراجع "دليل المقاسات" في صفحة المنتج.
${SIZE_GUIDE}
- لا تتعامل مع الدفع أو بيانات شخصية أو تعديل/إلغاء طلبات. لأسئلة الطلبات والمرتجعات وجّه العميل لصفحة "طلباتي"${contact ? ` أو واتساب المتجر ${contact}` : ""}.
- العملة: ${s?.currency_symbol_ar ?? ""}. السعر النهائي يُحسب عند الدفع.
- بعد suggest_items قول للعميل إنه يقدر يختار المقاس واللون ويضيف للسلة من الكروت تحت.`;

  const result = streamText({
    model: aiModel(ai),
    instructions,
    messages: messages as ModelMessage[],
    tools,
    stopWhen: isStepCount(12),
    abortSignal: request.signal,
  });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AssistantEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") send({ type: "text", delta: part.text });
          else if (part.type === "error") throw part.error;
        }
        send({ type: "products", items: [...suggested.values()] });
      } catch (e) {
        if (!request.signal.aborted) {
          const err = e as {
            statusCode?: number;
            lastError?: { statusCode?: number };
            message?: string;
          } | null;
          const status = Number(err?.statusCode ?? err?.lastError?.statusCode) || 500;
          console.error("assistant error", status, err?.message);
          send({ type: "error", status: [402, 403, 429].includes(status) ? status : 500 });
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" },
  });
}
