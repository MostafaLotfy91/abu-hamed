import { createOpenAI } from "@ai-sdk/openai";
import { streamText, tool, isStepCount, type ModelMessage } from "ai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { INSIGHT_QUERIES, type InsightEvent, type InsightName, type InsightRow } from "./insights-types";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";
const RUN_HEADER = "X-Lovable-AIG-Run-ID";
const WEEK_MS = 7 * 24 * 3600_000;

const bodySchema = z.object({
  mode: z.enum(["ask", "weekly"]),
  refresh: z.boolean().optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) })).max(40).optional(),
});

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const DESCRIPTIONS: Record<InsightName, string> = {
  sales_by_period: "Daily sales total and order count for the last N days.",
  top_products: "Products ranked by quantity sold in the last N days. order='desc' best sellers, 'asc' worst sellers.",
  sales_by_category: "Revenue and quantity per category in the last N days.",
  stock_by_variant: "Variant (size/color) stock with quantity sold in the last N days. sort='low_stock' or 'fast_selling'.",
  orders_by_status: "Order counts per status in the last N days.",
  return_rate: "Return rate and customer reasons for delivered items. by='product' or 'category'.",
  avg_order_value: "Order count, revenue and average order value for the last N days.",
  sales_by_governorate: "Orders and revenue per delivery city/governorate in the last N days.",
};

const paramsSchema = z.object({
  days: z.number().int().min(1).max(365).optional().describe("Look-back window in days, default 7"),
  limit: z.number().int().min(1).max(50).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  sort: z.enum(["low_stock", "fast_selling"]).optional(),
  by: z.enum(["product", "category"]).optional(),
});

const INSTRUCTIONS = `أنت محلل بيانات لمدير متجر أزياء. ردّ بالعربي (لهجة مصرية مهذبة) إلا لو السؤال بالإنجليزي، وباختصار ونقاط واضحة.
- لا تعتمد إلا على نتائج الأدوات. ممنوع اختراع أرقام. لو البيانات فاضية قول كده بصراحة.
- استخدم days مناسبة للسؤال (الأسبوع ده = 7، الشهر = 30).
- الجداول والرسوم بتظهر للمدير تلقائياً من نتائج الأدوات، فاكتب خلاصة قصيرة وتوصيات عملية بدل ما تعيد كل الأرقام.
- لاقتراحات إعادة التخزين: قارن المبيعات الأخيرة بالمخزون لكل مقاس/لون.
- للمرتجعات العالية: استنتج الأسباب المحتملة من الأسباب المكتوبة (مثلاً مشاكل المقاسات) واقترح حل.`;

const WEEKLY_PROMPT = `اعمل ملخص أسبوعي لآخر 7 أيام بعناوين قصيرة:
1) المبيعات ومتوسط قيمة الطلب مقارنة بالأسبوع اللي قبله (استخدم days=14 لـ sales_by_period).
2) الأكثر والأقل مبيعاً، وأقوى الأقسام والمحافظات.
3) تنبيهات: مقاسات/ألوان قربت تخلص ومقاسات/ألوان بتتباع بسرعة.
4) اقتراحات إعادة تخزين بكميات تقريبية.
5) منتجات نسبة مرتجعاتها عالية وأسبابها المحتملة.`;

function statusOf(e: any) {
  const s = Number(e?.statusCode ?? e?.lastError?.statusCode ?? e?.cause?.statusCode) || 500;
  return [402, 403, 429].includes(s) ? s : 500;
}

async function authorize(request: Request) {
  const url = process.env["SUPABASE_URL"];
  const anon = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !anon) return { error: json(500, { error: "config" }) };
  if (!token) return { error: json(401, { error: "unauthorized" }) };
  const db = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: u, error } = await db.auth.getUser(token);
  if (error || !u.user) return { error: json(401, { error: "unauthorized" }) };
  const { data: isAdmin } = await db.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
  if (!isAdmin) return { error: json(403, { error: "forbidden" }) };
  const { data: s } = await db.from("store_settings").select("features").eq("id", 1).maybeSingle();
  if (!(s as any)?.features?.ai_analytics) return { error: json(403, { error: "disabled" }) };
  return { db };
}

function runModel(db: SupabaseClient, messages: ModelMessage[], signal: AbortSignal, onData: (name: InsightName, rows: InsightRow[]) => void) {
  const apiKey = process.env["LOVABLE_API_KEY"]!;
  const tools = Object.fromEntries(
    INSIGHT_QUERIES.map((name) => [
      name,
      tool({
        description: DESCRIPTIONS[name],
        inputSchema: paramsSchema,
        execute: async (params) => {
          // Only predefined, aggregated queries — the model never writes SQL.
          const { data, error } = await db.rpc("admin_insight" as any, { _name: name, _params: params } as any);
          if (error) return { error: error.message };
          const rows = (data ?? []) as InsightRow[];
          onData(name, rows);
          return rows.slice(0, 50);
        },
      }),
    ]),
  );
  let runId: string | undefined;
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
  return streamText({
    model: provider.responses(MODEL),
    instructions: INSTRUCTIONS,
    messages,
    tools,
    stopWhen: isStepCount(10),
    abortSignal: signal,
    providerOptions: {
      openai: { store: false, forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] },
    },
  });
}

export async function handleInsights(request: Request): Promise<Response> {
  if (!process.env["LOVABLE_API_KEY"]) return json(500, { error: "config" });
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const db = auth.db!;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return json(400, { error: "bad_request" });
  }

  if (body.mode === "weekly") {
    if (!body.refresh) {
      const { data: c } = await db.from("ai_insights_cache" as any).select("payload,created_at").eq("kind", "weekly").maybeSingle();
      const row = c as any;
      if (row && Date.now() - new Date(row.created_at).getTime() < WEEK_MS)
        return json(200, { text: row.payload.text, created_at: row.created_at, cached: true });
    }
    try {
      const result = runModel(db, [{ role: "user", content: WEEKLY_PROMPT }], request.signal, () => {});
      let text = "";
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") text += part.text;
        else if (part.type === "error") throw part.error;
      }
      if (!text.trim()) return json(500, { error: "empty" });
      const created_at = new Date().toISOString();
      await db.from("ai_insights_cache" as any).upsert({ kind: "weekly", payload: { text }, created_at } as any);
      return json(200, { text, created_at, cached: false });
    } catch (e: any) {
      if (request.signal.aborted) return json(499, { error: "aborted" });
      const status = statusOf(e);
      console.error("insights weekly error", status, e?.message);
      return json(status, { error: "ai_error" });
    }
  }

  const messages = (body.messages ?? []).slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));
  if (!messages.length) return json(400, { error: "bad_request" });
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: InsightEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        const result = runModel(db, messages as ModelMessage[], request.signal, (name, rows) => send({ type: "data", name, rows: rows.slice(0, 50) }));
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") send({ type: "text", delta: part.text });
          else if (part.type === "error") throw part.error;
        }
      } catch (e: any) {
        if (!request.signal.aborted) {
          const status = statusOf(e);
          console.error("insights ask error", status, e?.message);
          send({ type: "error", status });
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
