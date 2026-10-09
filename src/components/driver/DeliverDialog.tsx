import { useState } from "react";
import { Banknote, CheckCircle2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMoney } from "@/components/store/use-money";
import { financeError } from "@/lib/driver-finance";
import { fromMinor, parseAmountInput, toMinor } from "@/lib/money";

export type DeliverOrder = {
  id: string;
  order_number: number;
  total: number | string;
  payment_method: string;
};

/**
 * Marking an order delivered. Cash on delivery: the driver confirms the amount collected; the expected amount
 * (the order total) is shown and cannot be edited. A different amount needs a reason and the order is flagged
 * for the admin. Paid online: a reminder not to collect anything.
 */
export function DeliverDialog({
  order,
  ar,
  onClose,
  onDone,
}: {
  order: DeliverOrder | null;
  ar: boolean;
  onClose: () => void;
  onDone: (outcome: "delivered" | "flagged") => void;
}) {
  return (
    <Dialog open={!!order} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        {order && <DeliverForm key={order.id} order={order} ar={ar} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  );
}

function DeliverForm({
  order,
  ar,
  onDone,
}: {
  order: DeliverOrder;
  ar: boolean;
  onDone: (outcome: "delivered" | "flagged") => void;
}) {
  const money = useMoney();
  const cod = order.payment_method === "cod";
  const expected = toMinor(order.total);
  const [amount, setAmount] = useState(String(fromMinor(expected)));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const collected = parseAmountInput(amount);
  const mismatch = cod && collected !== null && collected !== expected;
  const canSubmit =
    !busy && (!cod || (collected !== null && (!mismatch || reason.trim().length >= 3)));

  const submit = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("driver_mark_delivered", {
      _order_id: order.id,
      ...(cod ? { _collected: fromMinor(collected!) } : {}),
      ...(mismatch ? { _reason: reason.trim() } : {}),
    });
    setBusy(false);
    if (error) return toast.error(financeError(error.message, ar));
    onDone(data === "flagged" ? "flagged" : "delivered");
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {ar ? `تسليم الطلب #${order.order_number}` : `Deliver order #${order.order_number}`}
        </DialogTitle>
        <DialogDescription>
          {cod
            ? ar
              ? "أكّد المبلغ اللي استلمته من العميل"
              : "Confirm the amount you received from the customer"
            : ar
              ? "الطلب مدفوع أونلاين"
              : "This order is paid online"}
        </DialogDescription>
      </DialogHeader>
      {cod ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-brand-secondary/20 p-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Banknote className="h-4 w-4" />
              {ar ? "المطلوب تحصيله" : "Amount to collect"}
            </span>
            <span className="text-xl font-extrabold" data-testid="expected-amount">
              {money(fromMinor(expected))}
            </span>
          </div>
          <div>
            <Label htmlFor="collected-amount">
              {ar ? "المبلغ اللي اتحصّل" : "Amount collected"}
            </Label>
            <Input
              id="collected-amount"
              inputMode="decimal"
              dir="ltr"
              className="h-12 text-lg"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={collected === null}
            />
            {collected === null && (
              <p className="mt-1 text-xs text-destructive">
                {ar ? "اكتب مبلغ صحيح" : "Enter a valid amount"}
              </p>
            )}
          </div>
          {mismatch && (
            <div className="space-y-1 rounded-xl border border-destructive/40 p-3">
              <p className="text-sm font-semibold text-destructive" role="alert">
                {ar
                  ? `المبلغ مختلف عن المطلوب بـ ${money(fromMinor(collected! - expected))}. الطلب هيتراجع من الإدارة.`
                  : `This differs from the expected amount by ${money(fromMinor(collected! - expected))}. The order will be reviewed.`}
              </p>
              <Label htmlFor="mismatch-reason">{ar ? "السبب" : "Reason"}</Label>
              <Textarea
                id="mismatch-reason"
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                placeholder={ar ? "مثلاً: العميل رجّع قطعة" : "e.g. the customer returned one item"}
              />
            </div>
          )}
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-xl bg-success/10 p-3 font-bold text-success">
          <CreditCard className="h-5 w-5" />
          {ar ? "مدفوع — لا تحصّل أي مبلغ" : "Paid — do not collect anything"}
        </p>
      )}
      <DialogFooter>
        <Button
          className="w-full bg-success text-background hover:bg-success/90"
          disabled={!canSubmit}
          onClick={submit}
        >
          <CheckCircle2 className="me-1 h-4 w-4" />
          {ar ? "تأكيد التسليم" : "Confirm delivery"}
        </Button>
      </DialogFooter>
    </>
  );
}
