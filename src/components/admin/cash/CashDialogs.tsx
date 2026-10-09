import { useState } from "react";
import { Printer } from "lucide-react";
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
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/store-settings";
import { financeError, useDriverBalance } from "@/lib/driver-finance";
import { differenceMinor, fromMinor, parseAmountInput, toMinor } from "@/lib/money";

export type DriverRef = { id: string; name: string };

type Receipt = {
  settlement_id: string;
  expected_amount: number;
  received_amount: number;
  difference: number;
  balance_after: number;
  note: string;
  at: string;
};

/** Prints only the receipt (see .print-receipt in styles.css). */
function printReceipt() {
  document.body.classList.add("print-receipt-only");
  const done = () => {
    document.body.classList.remove("print-receipt-only");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
  setTimeout(done, 1000);
}

/**
 * "Receive settlement": shows the amount expected from the driver (the balance right now), takes the amount
 * actually received, requires a note when they differ, asks for confirmation, then shows a printable receipt.
 */
export function SettlementDialog({
  driver,
  ar,
  onClose,
  onSaved,
}: {
  driver: DriverRef | null;
  ar: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={!!driver} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        {driver && <SettlementForm key={driver.id} driver={driver} ar={ar} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function SettlementForm({
  driver,
  ar,
  onSaved,
}: {
  driver: DriverRef;
  ar: boolean;
  onSaved: () => void;
}) {
  const money = useMoney();
  const { user } = useAuth();
  const { settings } = useSettings();
  const balance = useDriverBalance(driver.id);
  const expected = toMinor(balance.data?.owed_to_store ?? 0);
  const [amount, setAmount] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const shown = amount ?? (balance.data ? String(fromMinor(expected)) : "");
  const received = parseAmountInput(shown, { allowNegative: true });
  const diff = received === null ? 0 : differenceMinor(received, expected);
  const valid = received !== null && received !== 0 && (diff === 0 || note.trim().length >= 3);

  const save = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_record_settlement", {
      _driver_id: driver.id,
      _received_amount: fromMinor(received!),
      _note: note.trim() || undefined,
    });
    setBusy(false);
    if (error) {
      setStep("form");
      return toast.error(financeError(error.message, ar));
    }
    const r = data![0];
    setReceipt({ ...r, note: note.trim(), at: new Date().toISOString() });
    onSaved();
  };

  if (receipt)
    return (
      <>
        <DialogHeader>
          <DialogTitle>{ar ? "إيصال استلام" : "Receipt"}</DialogTitle>
          <DialogDescription>{ar ? "اتسجلت التسوية" : "Settlement recorded"}</DialogDescription>
        </DialogHeader>
        <div
          className="print-receipt space-y-2 rounded-xl border p-4 text-sm"
          data-testid="settlement-receipt"
        >
          <p className="text-center text-base font-extrabold">
            {(ar ? settings?.name_ar : settings?.name_en) ?? ""}
          </p>
          <p className="text-center font-bold">
            {ar ? "إيصال استلام نقدية من مندوب" : "Cash received from driver"}
          </p>
          <Line
            k={ar ? "التاريخ" : "Date"}
            v={new Date(receipt.at).toLocaleString(ar ? "ar-EG" : "en-GB")}
          />
          <Line k={ar ? "المندوب" : "Driver"} v={driver.name} />
          <Line k={ar ? "المتوقع" : "Expected"} v={money(receipt.expected_amount)} />
          <Line k={ar ? "المستلم" : "Received"} v={money(receipt.received_amount)} strong />
          <Line k={ar ? "الفرق" : "Difference"} v={money(receipt.difference)} />
          <Line k={ar ? "الرصيد بعد التسوية" : "Balance after"} v={money(receipt.balance_after)} />
          {receipt.note && <Line k={ar ? "ملاحظة" : "Note"} v={receipt.note} />}
          <Line k={ar ? "استلمها" : "Received by"} v={user?.email ?? ""} />
          <Line
            k={ar ? "رقم الإيصال" : "Receipt no."}
            v={receipt.settlement_id.slice(0, 8).toUpperCase()}
          />
          <p className="pt-6 text-xs">
            {ar ? "توقيع المندوب: ____________" : "Driver signature: ____________"}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={printReceipt}>
            <Printer className="me-1 h-4 w-4" />
            {ar ? "طباعة" : "Print"}
          </Button>
        </DialogFooter>
      </>
    );

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {ar ? `استلام تسوية من ${driver.name}` : `Receive settlement from ${driver.name}`}
        </DialogTitle>
        <DialogDescription>
          {ar
            ? "المبلغ المتوقع = رصيد المندوب دلوقتي"
            : "Expected = the driver's balance right now"}
        </DialogDescription>
      </DialogHeader>
      {step === "form" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-muted p-3">
            <span className="text-sm font-semibold">{ar ? "المتوقع" : "Expected"}</span>
            <span className="text-xl font-extrabold" data-testid="settlement-expected">
              {balance.isLoading ? "…" : money(fromMinor(expected))}
            </span>
          </div>
          <div>
            <Label htmlFor="settlement-received">
              {ar ? "المبلغ المستلم فعلاً" : "Amount actually received"}
            </Label>
            <Input
              id="settlement-received"
              inputMode="decimal"
              dir="ltr"
              value={shown}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={received === null}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {ar
                ? "رقم سالب = المحل دفع للمندوب (لو المحل عليه فلوس)."
                : "A negative amount = the store paid the driver (when the store owes them)."}
            </p>
          </div>
          {diff !== 0 && received !== null && (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-destructive" role="alert">
                {ar ? "فرق: " : "Difference: "}
                {money(fromMinor(diff))}{" "}
                {diff < 0
                  ? ar
                    ? "(ناقص، هيفضل على المندوب)"
                    : "(short, stays owed)"
                  : ar
                    ? "(زيادة)"
                    : "(over)"}
              </p>
              <Label htmlFor="settlement-note">{ar ? "ملاحظة (مطلوبة)" : "Note (required)"}</Label>
              <Textarea
                id="settlement-note"
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button disabled={!valid || balance.isLoading} onClick={() => setStep("confirm")}>
              {ar ? "متابعة" : "Continue"}
            </Button>
          </DialogFooter>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="rounded-xl bg-muted p-3 text-sm" role="status">
            {ar
              ? `هتسجّل استلام ${money(fromMinor(received!))} من ${driver.name}. المتوقع ${money(fromMinor(expected))}${diff ? `، الفرق ${money(fromMinor(diff))}` : ""}. التسوية مش بتتعدل بعد الحفظ.`
              : `You are recording ${money(fromMinor(received!))} received from ${driver.name}. Expected ${money(fromMinor(expected))}${diff ? `, difference ${money(fromMinor(diff))}` : ""}. Settlements cannot be edited after saving.`}
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setStep("form")} disabled={busy}>
              {ar ? "رجوع" : "Back"}
            </Button>
            <Button onClick={save} disabled={busy}>
              {ar ? "تأكيد الحفظ" : "Confirm and save"}
            </Button>
          </DialogFooter>
        </div>
      )}
    </>
  );
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-dashed pb-1">
      <span className="text-muted-foreground">{k}</span>
      <span className={strong ? "font-extrabold" : "font-semibold"}>{v}</span>
    </div>
  );
}

/** A manual correction for a driver: + they owe more, - they owe less. Reason required. */
export function AdjustmentDialog({
  driver,
  ar,
  onClose,
  onSaved,
}: {
  driver: DriverRef | null;
  ar: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const money = useMoney();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const value = parseAmountInput(amount, { allowNegative: true });
  const valid = value !== null && value !== 0 && reason.trim().length >= 3;
  const close = () => {
    setAmount("");
    setReason("");
    onClose();
  };
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_add_adjustment", {
      _driver_id: driver!.id,
      _amount: fromMinor(value!),
      _reason: reason.trim(),
    });
    setBusy(false);
    if (error) return toast.error(financeError(error.message, ar));
    toast.success(ar ? "اتسجل التعديل" : "Adjustment recorded");
    onSaved();
    close();
  };
  return (
    <Dialog open={!!driver} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {ar ? `تعديل رصيد ${driver?.name ?? ""}` : `Adjust ${driver?.name ?? ""}`}
          </DialogTitle>
          <DialogDescription>
            {ar
              ? "موجب = المندوب عليه أكتر، سالب = نقلل اللي عليه"
              : "Positive = the driver owes more, negative = owes less"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="adjust-amount">{ar ? "المبلغ" : "Amount"}</Label>
            <Input
              id="adjust-amount"
              inputMode="decimal"
              dir="ltr"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="adjust-reason">{ar ? "السبب (مطلوب)" : "Reason (required)"}</Label>
            <Textarea
              id="adjust-reason"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!valid || busy} onClick={save}>
            {value !== null && value !== 0
              ? ar
                ? `تأكيد تعديل ${money(fromMinor(value))}`
                : `Confirm ${money(fromMinor(value))} adjustment`
              : ar
                ? "حفظ"
                : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type Review = {
  order_id: string;
  order_number: number | null;
  driver_name: string;
  expected_amount: number;
  collected_amount: number;
  reason: string | null;
};

/** Closes a COD amount mismatch: accept the difference (adjustment) or keep it owed by the driver. */
export function ReviewDialog({
  review,
  ar,
  onClose,
  onSaved,
}: {
  review: Review | null;
  ar: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const money = useMoney();
  const [accept, setAccept] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const diff = review ? toMinor(review.collected_amount) - toMinor(review.expected_amount) : 0;
  const close = () => {
    setNote("");
    setAccept(true);
    onClose();
  };
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_resolve_cod_review", {
      _order_id: review!.order_id,
      _adjustment: accept ? fromMinor(diff) : 0,
      _note: note.trim(),
    });
    setBusy(false);
    if (error) return toast.error(financeError(error.message, ar));
    toast.success(ar ? "اتقفلت المراجعة" : "Review closed");
    onSaved();
    close();
  };
  return (
    <Dialog open={!!review} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {ar
              ? `مراجعة مبلغ الطلب #${review?.order_number ?? ""}`
              : `Review order #${review?.order_number ?? ""}`}
          </DialogTitle>
          <DialogDescription>{review?.driver_name}</DialogDescription>
        </DialogHeader>
        {review && (
          <div className="space-y-3 text-sm">
            <Line k={ar ? "المطلوب" : "Expected"} v={money(review.expected_amount)} />
            <Line k={ar ? "اللي اتحصّل" : "Collected"} v={money(review.collected_amount)} strong />
            <Line k={ar ? "سبب المندوب" : "Driver's reason"} v={review.reason ?? ""} />
            <fieldset className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="review"
                  checked={accept}
                  onChange={() => setAccept(true)}
                />
                {ar
                  ? `اعتماد الفرق (تعديل ${money(fromMinor(diff))})`
                  : `Accept the difference (adjust ${money(fromMinor(diff))})`}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="review"
                  checked={!accept}
                  onChange={() => setAccept(false)}
                />
                {ar ? "الفرق يفضل على المندوب" : "The driver still owes the difference"}
              </label>
            </fieldset>
            <div>
              <Label htmlFor="review-note">{ar ? "ملاحظة (مطلوبة)" : "Note (required)"}</Label>
              <Textarea
                id="review-note"
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button disabled={busy || note.trim().length < 3} onClick={save}>
            {ar ? "قفل المراجعة" : "Close review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Reverses a delivery's COD and commission entries (refused at the door, marked delivered by mistake). */
export function ReverseDialog({
  order,
  ar,
  onClose,
  onSaved,
}: {
  order: { id: string; number: number | null } | null;
  ar: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const close = () => {
    setReason("");
    onClose();
  };
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_reverse_delivery", {
      _order_id: order!.id,
      _reason: reason.trim(),
    });
    setBusy(false);
    if (error) return toast.error(financeError(error.message, ar));
    toast.success(ar ? "اتعكس قيد التسليم" : "Delivery entries reversed");
    onSaved();
    close();
  };
  return (
    <Dialog open={!!order} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {ar
              ? `عكس قيود الطلب #${order?.number ?? ""}`
              : `Reverse order #${order?.number ?? ""}`}
          </DialogTitle>
          <DialogDescription>
            {ar
              ? "بيكتب قيود عكسية للتحصيل والعمولة. مفيش حاجة بتتمسح."
              : "Writes reversing entries for the cash and commission. Nothing is deleted."}
          </DialogDescription>
        </DialogHeader>
        <Label htmlFor="reverse-reason">{ar ? "السبب (مطلوب)" : "Reason (required)"}</Label>
        <Textarea
          id="reverse-reason"
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />
        <DialogFooter>
          <Button variant="destructive" disabled={busy || reason.trim().length < 3} onClick={save}>
            {ar ? "تأكيد العكس" : "Confirm reversal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
