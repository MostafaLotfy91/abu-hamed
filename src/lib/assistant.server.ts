import { createOpenAI } from "@ai-sdk/openai";
import { streamText, tool, isStepCount, type ModelMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { effectivePrice } from "./format";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";
const RUN_HEADER = "X-Lovable-AIG-Run-ID";

import type { AssistantProduct } from "./assistant-types";
export type { AssistantProduct };

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) }))
    .min(1)
    .max(30),
});

const COLS = "id,name_ar,name_en,brand,price,old_price,flash_price,flash_ends_at,unit,step,min_qty,stock,images";

function toProduct(r: any): AssistantProduct {
  return {
    id: r.id,
    name_ar: r.name_ar,
    name_en: r.name_en,
    price: effectivePrice(r).current,
    unit: r.unit,
    step: Number(r.step),
    min_qty: Number(r.min_qty),
    image: r.images?.[0] ?? null,
    in_stock: Number(r.stock) > 0,
  };
}

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

export async function handleAssistant(request: Request): Promise<Response> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  const url = process.env["SUPABASE_URL"];
  const anon = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!apiKey || !url || !anon) return json(500, { error: "config" });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return json(400, { error: "bad_request" });
  }

  const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: settings } = await db.from("store_settings").select("features,name_ar,currency_symbol_ar").limit(1).maybeSingle();
  if (!(settings as any)?.features?.ai_assistant) return json(403, { error: "disabled" });

  // Every product the model saw, so suggestions can only reference real rows.
  const seen = new Map<string, AssistantProduct>();
  const suggested = new Map<string, AssistantProduct>();

  const tools = {
    search_products: tool({
      description: "Search the store catalog. Use short Arabic or English keywords (one item type per call, e.g. 'أرز', 'فراخ', 'طماطم').",
      inputSchema: z.object({ query: z.string().min(1).max(60) }),
      execute: async ({ query }) => {
        const q = query.replace(/[%,()]/g, " ").trim();
        const { data } = await db
          .from("products")
          .select(COLS)
          .eq("is_active", true)
          .or(`name_ar.ilike.%${q}%,name_en.ilike.%${q}%,brand.ilike.%${q}%,description_ar.ilike.%${q}%`)
          .limit(8);
        const list = (data ?? []).map(toProduct);
        list.forEach((p) => seen.set(p.id, p));
        return list.map((p) => ({ id: p.id, name: p.name_ar, price: p.price, unit: p.unit, step: p.step, min_qty: p.min_qty, in_stock: p.in_stock }));
      },
    }),
    suggest_items: tool({
      description: "Show product cards to the user with an add-to-cart button. Only use ids returned by search_products.",
      inputSchema: z.object({
        items: z.array(z.object({ product_id: z.string(), quantity: z.number().positive() })).min(1).max(20),
      }),
      execute: async ({ items }) => {
        const rejected: string[] = [];
        for (const it of items) {
          const p = seen.get(it.product_id);
          if (!p) { rejected.push(it.product_id); continue; }
          suggested.set(p.id, { ...p, suggested_qty: Math.max(p.min_qty, it.quantity) });
        }
        return { shown: items.length - rejected.length, rejected_unknown_ids: rejected };
      },
    }),
  };

  const currency = (settings as any)?.currency_symbol_ar ?? "";
  const instructions = `أنت مساعد تسوق لمتجر "${(settings as any)?.name_ar ?? "المتجر"}". رد دائماً بالعربية (عامية مصرية بسيطة ومهذبة) وباختصار.
قواعد صارمة:
- لا تذكر أي منتج أو سعر إلا إذا رجع من أداة search_products. ممنوع اختراع منتجات أو أسعار أو عروض.
- لو المستخدم طلب حاجة (مثلاً عشا لـ 4 أفراد) فكّر في المكونات، وابحث عن كل صنف بكلمة قصيرة، ثم استدعِ suggest_items بالمنتجات المناسبة والكميات (احترم min_qty و step والوحدة).
- لو صنف مش موجود في المتجر قول بوضوح إنه غير متوفر.
- تجنب المنتجات غير المتوفرة (in_stock=false) أو نبّه عليها.
- العملة: ${currency}. الأسعار تقريبية والسعر النهائي يُحسب عند الدفع.
- اذكر في ردك قائمة مختصرة بالأصناف والأسعار، وقول للمستخدم إنه يقدر يضيفها للسلة من الكروت تحت.`;

  let runId = request.headers.get(RUN_HEADER) ?? undefined;
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      if (runId && !headers.has(RUN_HEADER)) headers.set(RUN_HEADER, runId);
      const res = await fetch(input, { ...init, headers });
      runId ??= res.headers.get(RUN_HEADER) ?? undefined;
      return res;
    },
  });

  try {
    const result = streamText({
      model: provider.responses(MODEL),
      instructions,
      messages: body.messages as ModelMessage[],
      tools,
      stopWhen: isStepCount(10),
      abortSignal: request.signal,
      providerOptions: {
        openai: {
          store: false,
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    const text = await result.text;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (runId) headers[RUN_HEADER] = runId;
    return new Response(JSON.stringify({ text, products: [...suggested.values()] }), { headers });
  } catch (e: any) {
    if (request.signal.aborted) return json(499, { error: "aborted" });
    const status = Number(e?.statusCode ?? e?.lastError?.statusCode) || 500;
    console.error("assistant error", status, e?.message);
    return json(status === 402 || status === 429 || status === 403 ? status : 500, { error: "ai_failed" });
  }
}
