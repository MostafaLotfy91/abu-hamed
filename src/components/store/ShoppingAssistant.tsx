import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { RotateCcw, Send, Shirt, X } from "lucide-react";
import { useSettings } from "@/lib/store-settings";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AssistantEvent, AssistantProduct } from "@/lib/assistant-types";
import { AssistantProductCard } from "./AssistantProductCard";

type Msg = { role: "user" | "assistant"; content: string; products?: AssistantProduct[]; error?: boolean };

const CHIPS_AR = ["طقم لفرح", "هدية لراجل", "لبس العيد للأطفال", "عطر يومي"];
const CHIPS_EN = ["Wedding outfit", "Gift for a man", "Eid outfit for kids", "Everyday perfume"];
const MAX_LEN = 1000;

function errorText(status: number, ar: boolean) {
  if (status === 402) return ar ? "المساعد مش متاح دلوقتي، جرب بعدين." : "The stylist is unavailable right now, try later.";
  if (status === 429) return ar ? "بعت رسايل كتير، استنى شوية وجرب تاني." : "Too many messages, please wait a bit.";
  if (status === 403) return ar ? "المساعد مش متاح حالياً." : "The stylist is not available.";
  return ar ? "حصلت مشكلة، جرب تاني." : "Something went wrong, try again.";
}

/** Floating AI stylist chat, shown only when the ai_assistant flag is on. */
export function ShoppingAssistant() {
  const { features, settings } = useSettings();
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => { if (open && !busy) inputRef.current?.focus(); }, [open, busy]);

  if (!features.ai_assistant) return null;
  const sym = { ar: settings?.currency_symbol_ar, en: settings?.currency_symbol_en };

  const patchLast = (fn: (m: Msg) => Msg) => setMsgs((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);

  const reset = () => { abortRef.current?.abort(); setMsgs([]); setInput(""); };

  const send = async (text: string) => {
    const content = text.trim().slice(0, MAX_LEN);
    if (!content || busy) return;
    const history = [...msgs, { role: "user" as const, content }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          messages: history.filter((m) => !m.error && m.content).slice(-12).map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!res.ok || !res.body) {
        patchLast(() => ({ role: "assistant", content: errorText(res.status, ar), error: true }));
        return;
      }
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
          const ev = JSON.parse(line) as AssistantEvent;
          if (ev.type === "text") patchLast((m) => ({ ...m, content: m.content + ev.delta }));
          else if (ev.type === "products") patchLast((m) => ({ ...m, products: ev.items }));
          else if (ev.type === "error") patchLast(() => ({ role: "assistant", content: errorText(ev.status, ar), error: true }));
        }
      }
    } catch {
      if (!ac.signal.aborted) patchLast(() => ({ role: "assistant", content: ar ? "تعذر الاتصال، جرب تاني." : "Connection failed, try again.", error: true }));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const last = msgs[msgs.length - 1];
  const typing = busy && last?.role === "assistant" && !last.content;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 end-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg md:bottom-6"
          aria-label={ar ? "الستايلست" : "Stylist"}
        >
          <Shirt className="h-6 w-6" />
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background md:inset-y-0 md:end-0 md:start-auto md:w-[420px] md:border-s md:shadow-2xl">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary"><Shirt className="h-5 w-5" /></div>
            <div className="flex-1">
              <div className="font-bold">{ar ? "الستايلست" : "Stylist"}</div>
              <div className="text-xs text-muted-foreground">{ar ? "بيرشح من منتجات المتجر بس" : "Recommends store products only"}</div>
            </div>
            {msgs.length > 0 && (
              <Button variant="ghost" size="icon" onClick={reset} aria-label={ar ? "محادثة جديدة" : "New conversation"} title={ar ? "محادثة جديدة" : "New conversation"}>
                <RotateCcw className="h-5 w-5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => { abortRef.current?.abort(); setOpen(false); }} aria-label={ar ? "إغلاق" : "Close"}><X className="h-5 w-5" /></Button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.length === 0 && (
              <div className="space-y-3 pt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {ar ? "قولي المناسبة والميزانية والمقاس، وأنا أظبطلك اللوك من المتجر." : "Tell me the occasion, budget and size — I'll put a look together from the store."}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {(ar ? CHIPS_AR : CHIPS_EN).map((e) => (
                    <button key={e} onClick={() => send(e)} className="rounded-full border px-3 py-1.5 text-sm hover:bg-accent">{e}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="ms-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-se-sm bg-primary px-3 py-2 text-sm text-primary-foreground">{m.content}</div>
              ) : !m.content && !m.products ? null : (
                <div key={i} className="space-y-2">
                  {m.content && (
                    <div className={`prose prose-sm max-w-none text-sm ${m.error ? "text-destructive" : ""}`}><ReactMarkdown>{m.content}</ReactMarkdown></div>
                  )}
                  {m.products?.map((p) => <AssistantProductCard key={p.id} p={p} sym={sym} onNavigate={() => setOpen(false)} />)}
                </div>
              ),
            )}
            {typing && (
              <div className="flex gap-1 px-1 py-2" aria-label={ar ? "بيكتب" : "typing"}>
                {[0, 150, 300].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${d}ms` }} />)}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-end gap-2 border-t p-3">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder={ar ? "اكتب طلبك…" : "Type your request…"}
              rows={1}
              maxLength={MAX_LEN}
              className="max-h-32 min-h-10 resize-none"
            />
            <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label={ar ? "إرسال" : "Send"}><Send className="h-4 w-4 rtl:-scale-x-100" /></Button>
          </form>
        </div>
      )}
    </>
  );
}
