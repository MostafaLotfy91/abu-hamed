import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

const LS = "app.recentSearches";

export function SearchBox() {
  const { t, tx } = useI18n();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem(LS) || "[]"));
    } catch {
      /* */
    }
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(id);
  }, [q]);

  const { data: suggestions = [] } = useQuery({
    queryKey: ["suggest", debounced],
    enabled: debounced.length >= 1,
    queryFn: async () => {
      const s = debounced.replace(/[%,()]/g, " ");
      const { data } = await supabase
        .from("products")
        .select("id,name_ar,name_en,images,thumbnails")
        .eq("is_active", true)
        .or(`name_ar.ilike.%${s}%,name_en.ilike.%${s}%,brand.ilike.%${s}%`)
        .limit(6);
      return data ?? [];
    },
  });

  const submit = (term: string) => {
    const v = term.trim();
    if (!v) return;
    const next = [v, ...recent.filter((r) => r !== v)].slice(0, 8);
    setRecent(next);
    localStorage.setItem(LS, JSON.stringify(next));
    setOpen(false);
    nav({ to: "/products", search: { q: v } });
  };

  return (
    <div ref={wrap} className="relative w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(q);
        }}
        className="flex h-11 items-center gap-2 rounded-xl bg-secondary px-3"
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          placeholder={t("search_placeholder")}
          className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="clear">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </form>
      {open && (debounced ? suggestions.length > 0 : recent.length > 0) && (
        <div className="absolute inset-x-0 top-12 z-50 overflow-hidden rounded-xl border bg-popover shadow-card">
          {debounced ? (
            suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setOpen(false);
                  setQ("");
                  nav({ to: "/product/$id", params: { id: s.id } });
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-start text-sm hover:bg-accent"
              >
                {(s.thumbnails?.[0] ?? s.images?.[0]) && (
                  <img
                    src={s.thumbnails?.[0] ?? s.images?.[0]}
                    alt=""
                    width={32}
                    height={32}
                    loading="lazy"
                    className="h-8 w-8 rounded-md object-cover"
                  />
                )}
                {tx(s, "name")}
              </button>
            ))
          ) : (
            <div className="p-2">
              <div className="flex items-center justify-between px-1 pb-1 text-xs text-muted-foreground">
                {t("recent_searches")}
                <button
                  onClick={() => {
                    setRecent([]);
                    localStorage.removeItem(LS);
                  }}
                >
                  {t("clear")}
                </button>
              </div>
              {recent.map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    setQ(r);
                    submit(r);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-start text-sm hover:bg-accent"
                >
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" /> {r}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
