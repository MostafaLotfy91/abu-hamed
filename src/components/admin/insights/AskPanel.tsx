import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { InsightEvent, InsightName, InsightRow } from "@/lib/insights-types";
import { aiErrorText, insightsFetch } from "./api";
import { DataView } from "./DataView";

type Msg = { role: "user" | "assistant"; content: string; data?: { name: InsightName; rows: InsightRow[] }[]; error?: boolean };

const CHIPS = ["إيه أكتر منتجات اتباعت الأسبوع ده؟", "إيه المقاسات اللي قربت تخلص؟", "أنهي منتجات مرتجعاتها عالية وليه؟", "المبيعات حسب المحافظة الشهر ده"];

export function AskPanel({ ar }: { ar: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const patch = (fn: (m: Msg) => Msg) => setMsgs((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);

  const send = async (text: string) => {
    const content = text.trim().slice(0, 1000);
    if (!content || busy) return;
    const history = [...msgs, { role: "user" as const, content }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await insightsFetch(
        { mode: "ask", messages: history.filter((m) => !m.error && m.content).map(({ role, content }) => ({ role, content })) },
        ac.signal,
      );
      if (!res.ok || !res.body) return patch(() => ({ role: "assistant", content: aiErrorText(res.status, ar), error: true }));
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as InsightEvent;
          if (ev.type === "text") patch((m) => ({ ...m, content: m.content + ev.delta }));
          else if (ev.type === "data") patch((m) => ({ ...m, data: [...(m.data ?? []), { name: ev.name, rows: ev.rows }] }));
          else patch(() => ({ role: "assistant", content: aiErrorText(ev.status, ar), error: true }));
        }
      }
    } catch {
      if (!ac.signal.aborted) patch(() => ({ role: "assistant", content: aiErrorText(0, ar), error: true }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((c) => <Button key={c} size="sm" variant="outline" disabled={busy} onClick={() => send(c)}>{c}</Button>)}
      </div>
      <div className="space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "ms-auto max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground" : "space-y-2"}>
            {m.role === "user" ? m.content : (
              <>
                {m.data?.map((d, j) => <DataView key={j} title={d.name} rows={d.rows} />)}
                {m.content ? (
                  <div className={`prose prose-sm max-w-none rounded-2xl bg-muted px-3 py-2 ${m.error ? "text-destructive" : ""}`}><ReactMarkdown>{m.content}</ReactMarkdown></div>
                ) : busy && i === msgs.length - 1 ? <p className="text-sm text-muted-foreground">{ar ? "بحلل البيانات…" : "Analyzing…"}</p> : null}
              </>
            )}
          </div>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <Textarea rows={2} value={input} maxLength={1000} onChange={(e) => setInput(e.target.value)} placeholder={ar ? "اسأل عن المبيعات أو المخزون أو المرتجعات…" : "Ask about sales, stock or returns…"}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        <Button type="submit" disabled={busy || !input.trim()} aria-label="send"><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
