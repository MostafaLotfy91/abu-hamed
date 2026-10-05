import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import { Bot, Loader2, Plus, Send, ShoppingBasket, X } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/lib/store-settings";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { formatMoney, formatQty } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AssistantProduct } from "@/lib/assistant-types";

type Msg = { role: "user" | "assistant"; content: string; products?: AssistantProduct[]; error?: boolean };

const EXAMPLES = ["عايز لبس عيد لولد 6 سنين", "إيه عروض العبايات النهارده؟", "محتاج عطر رجالي هدية"];

export function ShoppingAssistant() {
  const { features, settings } = useSettings();
  const { lang } = useI18n();
  const cart = useCart();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [msgs, busy]);

  if (!features.ai_assistant) return null;
  const sym = { ar: settings?.currency_symbol_ar, en: settings?.currency_symbol_en };

  const addOne = (p: AssistantProduct, qty?: number) =>
    cart.add(
      { productId: p.id, variantId: null, name_ar: p.name_ar, name_en: p.name_en, image: p.image, price: p.price },
      qty,
    );

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({ messages: next.filter((m) => !m.error).slice(-20).map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          res.status === 402 ? "رصيد الذكاء الاصطناعي للمتجر خلص. حاول لاحقاً."
          : res.status === 429 ? "في طلبات كتير دلوقتي، استنى شوية وجرب تاني."
          : res.status === 403 ? "المساعد مش متاح حالياً."
          : "حصلت مشكلة، جرب تاني.";
        setMsgs((m) => [...m, { role: "assistant", content: msg, error: true }]);
      } else {
        setMsgs((m) => [...m, { role: "assistant", content: data.text || "…", products: data.products ?? [] }]);
      }
    } catch {
      if (!ac.signal.aborted) setMsgs((m) => [...m, { role: "assistant", content: "تعذر الاتصال، جرب تاني.", error: true }]);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 end-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg md:bottom-6"
          aria-label="مساعد التسوق"
        >
          <ShoppingBasket className="h-6 w-6" />
        </button>
      )}
      {open && (
        <div dir="rtl" className="fixed inset-0 z-50 flex flex-col bg-background md:inset-auto md:bottom-6 md:end-6 md:h-[600px] md:w-[400px] md:rounded-2xl md:border md:shadow-2xl">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="h-5 w-5" /></div>
            <div className="flex-1">
              <div className="font-bold">مساعد التسوق</div>
              <div className="text-xs text-muted-foreground">بيقترح من منتجات المتجر بس</div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => { abortRef.current?.abort(); setOpen(false); }} aria-label="إغلاق"><X className="h-5 w-5" /></Button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.length === 0 && (
              <div className="space-y-3 text-center">
                <p className="text-sm text-muted-foreground">قولي محتاج إيه، وأنا أدورلك في المتجر وأجهزلك السلة.</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {EXAMPLES.map((e) => (
                    <button key={e} onClick={() => send(e)} className="rounded-full border px-3 py-1.5 text-sm hover:bg-accent">{e}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="ms-auto max-w-[85%] rounded-2xl rounded-se-sm bg-primary px-3 py-2 text-sm text-primary-foreground">{m.content}</div>
              ) : (
                <div key={i} className="space-y-2">
                  <div className={`prose prose-sm max-w-none text-sm ${m.error ? "text-destructive" : ""}`}><ReactMarkdown>{m.content}</ReactMarkdown></div>
                  {!!m.products?.length && (
                    <div className="space-y-2">
                      {m.products.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 rounded-xl border bg-card p-2">
                          {p.image ? <img src={p.image} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <div className="h-12 w-12 rounded-lg bg-muted" />}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">{lang === "ar" ? p.name_ar : p.name_en}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatMoney(p.price, lang, sym)} · {formatQty(p.suggested_qty ?? 1, lang)}
                              {!p.in_stock && <span className="text-destructive"> · غير متوفر</span>}
                            </div>
                          </div>
                          {p.has_variants ? (
                            <Button size="sm" variant="outline" asChild><Link to="/product/$id" params={{ id: p.id }} onClick={() => setOpen(false)}>اختار المقاس</Link></Button>
                          ) : (
                            <Button size="icon" variant="outline" disabled={!p.in_stock} onClick={() => { addOne(p, p.suggested_qty); toast.success("اتضاف للسلة"); }} aria-label="أضف للسلة"><Plus className="h-4 w-4" /></Button>
                          )}
                        </div>
                      ))}
                      {m.products.filter((p) => p.in_stock && !p.has_variants).length > 1 && (
                        <Button
                          className="w-full"
                          onClick={() => {
                            const ok = m.products!.filter((p) => p.in_stock && !p.has_variants);
                            ok.forEach((p) => addOne(p, p.suggested_qty));
                            toast.success(`اتضاف ${ok.length} صنف للسلة`);
                            cart.setDrawerOpen(true);
                          }}
                        >
                          أضف الكل للسلة
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ),
            )}
            {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> بدور في المتجر…</div>}
            <div ref={endRef} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-end gap-2 border-t p-3">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="اكتب طلبك…"
              rows={1}
              maxLength={2000}
              className="max-h-32 min-h-10 resize-none"
            />
            <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="إرسال"><Send className="h-4 w-4 rtl:-scale-x-100" /></Button>
          </form>
        </div>
      )}
    </>
  );
}
