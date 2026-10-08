import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useMoney } from "@/components/store/use-money";
import { ALL_STATUSES, StatusBadge, canMoveTo, statusKey } from "@/components/store/OrderTimeline";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/store/states";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BulkBar, Check, PAGE, Pager } from "@/components/admin/TableKit";
import { DispatchBadge, useOpenOffers } from "@/lib/dispatch";
import { useDrivers } from "@/lib/drivers";
import { countLabel } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/orders/")({ component: Page });

function Page() {
  const { t, lang } = useI18n();
  const Chevron = lang === "ar" ? ChevronLeft : ChevronRight;
  const money = useMoney();
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("all");
  // "waiting" = no driver available (dispatch found nobody); a quick filter next to the status chips.
  const WAITING = "waiting";
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);
  const [page, setPage] = useState(0);
  const [confirm, confirmDialog] = useConfirm();
  // Server-side paging and search: digits = order number, otherwise the recipient's phone or name.
  const q = useQuery({
    queryKey: ["admin", "orders", status, page, term],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let qq = supabase
        .from("orders")
        .select(
          "id,order_number,status,total,created_at,address,payment_method,delivery_slot,dispatch_status,driver_id",
          {
            count: "exact",
          },
        )
        .order("created_at", { ascending: false });
      if (status === WAITING)
        qq = qq.eq("dispatch_status", "no_driver_available").is("driver_id", null);
      else if (status !== "all") qq = qq.eq("status", status);
      const s = term.replace(/[%,()*]/g, " ").trim();
      if (/^#?\d+$/.test(s)) qq = qq.eq("order_number", Number(s.replace("#", "")));
      else if (s) qq = qq.or(`address->>phone.ilike.%${s}%,address->>recipient_name.ilike.%${s}%`);
      const { data, error, count } = await qq.range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });
  useEffect(() => {
    const ch = supabase
      .channel("admin-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () =>
        qc.invalidateQueries({ queryKey: ["admin", "orders"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const pageRows = q.data?.rows ?? [];
  const offers = useOpenOffers(
    pageRows.filter((o) => o.dispatch_status === "offered").map((o) => o.id),
  );
  const drivers = useDrivers();
  const driverName = (id: string | null | undefined) => {
    const d = drivers.data?.find((x) => x.user_id === id);
    return d?.full_name ?? d?.email ?? "";
  };
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const cur = Math.min(page, pages - 1);
  const allOnPage = pageRows.length > 0 && pageRows.every((o) => sel.has(o.id));
  // Only orders that may move to `st` are updated (the database rejects any other transition).
  const bulkStatus = async (st: string) => {
    const eligible = pageRows
      .filter((o) => sel.has(o.id) && canMoveTo(o.status, st))
      .map((o) => o.id);
    const skipped = sel.size - eligible.length;
    if (!eligible.length)
      return toast.error(
        lang === "ar"
          ? "لا يمكن نقل الطلبات المحددة لهذه الحالة"
          : "None of the selected orders can move to this status",
      );
    if (
      st === "cancelled" &&
      !(await confirm({
        title:
          lang === "ar"
            ? `إلغاء ${countLabel(eligible.length, "ar", "order")}؟`
            : `Cancel ${countLabel(eligible.length, "en", "order")}?`,
        description:
          lang === "ar"
            ? "يرجع المخزون والكوبونات تلقائياً."
            : "Stock and coupon uses are restored.",
        destructive: true,
      }))
    )
      return;
    const { error } = await supabase.from("orders").update({ status: st }).in("id", eligible);
    if (error) return toast.error(error.message);
    toast.success(
      `✓ ${eligible.length}` +
        (skipped ? (lang === "ar" ? ` — تم تخطي ${skipped}` : ` — ${skipped} skipped`) : ""),
    );
    setSel(new Set());
    qc.invalidateQueries({ queryKey: ["admin", "orders"] });
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight">{lang === "ar" ? "الطلبات" : "Orders"}</h1>
        <Input
          className="h-9 w-56"
          placeholder="# / phone"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {["all", ...ALL_STATUSES, WAITING].map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatus(s);
              setPage(0);
              setSel(new Set());
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              status === s
                ? "border-foreground bg-foreground text-background"
                : "hover:border-foreground",
            )}
          >
            {s === "all"
              ? lang === "ar"
                ? "الكل"
                : "All"
              : s === WAITING
                ? lang === "ar"
                  ? "بانتظار مندوب"
                  : "Waiting for a driver"
                : t(statusKey(s))}
          </button>
        ))}
      </div>
      <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
        {(["confirmed", "preparing", "cancelled"] as const).map((st) => (
          <Button
            key={st}
            size="sm"
            variant="outline"
            className={st === "cancelled" ? "text-destructive" : ""}
            onClick={() => bulkStatus(st)}
          >
            {t(statusKey(st))}
          </Button>
        ))}
      </BulkBar>
      {confirmDialog}
      {q.isLoading ? (
        <RowSkeleton n={6} />
      ) : q.error ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !pageRows.length ? (
        <EmptyState title={t("no_orders")} />
      ) : (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-md border bg-card">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 p-3">
                    <Check
                      label="select all"
                      checked={allOnPage}
                      onChange={(v) =>
                        setSel((s) => {
                          const n = new Set(s);
                          pageRows.forEach((o) => (v ? n.add(o.id) : n.delete(o.id)));
                          return n;
                        })
                      }
                    />
                  </th>
                  {[
                    lang === "ar" ? "رقم" : "#",
                    lang === "ar" ? "العميل" : "Customer",
                    lang === "ar" ? "التاريخ" : "Date",
                    lang === "ar" ? "الحالة" : "Status",
                    lang === "ar" ? "التوزيع" : "Dispatch",
                    t("total"),
                    "",
                  ].map((h, i) => (
                    <th key={i} className="p-3 text-start font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageRows.map((o) => {
                  const a = o.address as Record<string, string>;
                  return (
                    <tr key={o.id} className={sel.has(o.id) ? "bg-muted/40" : "hover:bg-muted/30"}>
                      <td className="p-3">
                        <Check
                          label="select"
                          checked={sel.has(o.id)}
                          onChange={(v) =>
                            setSel((s) => {
                              const n = new Set(s);
                              if (v) n.add(o.id);
                              else n.delete(o.id);
                              return n;
                            })
                          }
                        />
                      </td>
                      <td className="p-3 font-bold">
                        <Link to="/admin/orders/$id" params={{ id: o.id }}>
                          #{o.order_number}
                        </Link>
                      </td>
                      <td className="p-3">
                        {a?.recipient_name ?? a?.label}{" "}
                        <span className="text-xs text-muted-foreground" dir="ltr">
                          {a?.phone}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}
                      </td>
                      <td className="p-3">
                        <StatusBadge status={o.status} />
                      </td>
                      <td className="p-3">
                        {["confirmed", "preparing", "out_for_delivery"].includes(o.status) ? (
                          <div className="space-y-0.5">
                            <DispatchBadge status={o.dispatch_status} ar={lang === "ar"} />
                            {(o.dispatch_status === "offered" || o.driver_id) && (
                              <div className="text-xs text-muted-foreground">
                                {driverName(o.driver_id ?? offers.data?.get(o.id)?.driver_id)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 font-bold">{money(o.total)}</td>
                      <td className="p-3">
                        <Link
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-primary hover:bg-accent"
                          to="/admin/orders/$id"
                          params={{ id: o.id }}
                          aria-label={
                            lang === "ar"
                              ? `فتح الطلب #${o.order_number}`
                              : `Open order #${o.order_number}`
                          }
                        >
                          {/* Points the reading direction: left in Arabic, right in English. */}
                          <Chevron className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager
            page={cur}
            pages={pages}
            total={total}
            onPage={(p) => {
              setPage(p);
              setSel(new Set());
            }}
          />
        </div>
      )}
    </div>
  );
}
