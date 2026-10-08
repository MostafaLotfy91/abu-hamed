import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { WeeklySummary } from "@/lib/insights-types";
import { aiErrorText, insightsFetch } from "./api";

/** Weekly AI summary; the server returns the cached copy (≤ 7 days old) unless refreshed. */
export function WeeklyPanel({ ar }: { ar: boolean }) {
  const [data, setData] = useState<WeeklySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (refresh = false) => {
    setBusy(true);
    setError(null);
    try {
      const res = await insightsFetch({ mode: "weekly", refresh });
      if (!res.ok) return setError(aiErrorText(res.status, ar));
      setData(await res.json());
    } catch {
      setError(aiErrorText(0, ar));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    load(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {data &&
            `${ar ? "آخر تحديث" : "Updated"}: ${new Date(data.created_at).toLocaleString(ar ? "ar-EG" : "en-US")}`}
        </p>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => load(true)}>
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          {ar ? "تحديث" : "Refresh"}
        </Button>
      </div>
      {error && (
        <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}
      {busy && !data ? (
        <Skeleton className="h-48" />
      ) : (
        data && (
          <div className="prose prose-sm max-w-none rounded-2xl bg-muted p-4">
            <ReactMarkdown>{data.text}</ReactMarkdown>
          </div>
        )
      )}
    </div>
  );
}
