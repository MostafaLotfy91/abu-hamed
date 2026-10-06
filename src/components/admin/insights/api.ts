import { supabase } from "@/integrations/supabase/client";
import type { InsightName, InsightRow } from "@/lib/insights-types";

/** POSTs to the admin insights route with the signed-in user's token. */
export async function insightsFetch(body: unknown, signal?: AbortSignal) {
  const { data } = await supabase.auth.getSession();
  return fetch("/api/admin-insights", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
}

/** Runs one fixed aggregated query directly (no AI). */
export async function runInsight(name: InsightName, params: Record<string, unknown> = {}) {
  const { data, error } = await supabase.rpc("admin_insight" as any, { _name: name, _params: params } as any);
  if (error) throw error;
  return (data ?? []) as InsightRow[];
}

export function aiErrorText(status: number, ar: boolean) {
  if (status === 402) return ar ? "رصيد الذكاء الاصطناعي خلص. زوّد الرصيد من الإعدادات وجرب تاني." : "AI credits ran out. Top up and try again.";
  if (status === 429) return ar ? "طلبات كتير في وقت قصير، استنى دقيقة وجرب تاني." : "Too many requests, wait a minute and retry.";
  if (status === 403) return ar ? "التحليلات الذكية غير مفعلة أو غير مسموح لك." : "AI analytics is off or not allowed.";
  return ar ? "حصلت مشكلة، جرب تاني." : "Something went wrong, try again.";
}
