import { Ruler } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { SizeType } from "@/lib/fashion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const CLOTHES = [
  ["S", "88–94", "74–80", "92–98", "66–68"],
  ["M", "95–101", "81–87", "99–105", "69–71"],
  ["L", "102–108", "88–94", "106–112", "72–74"],
  ["XL", "109–115", "95–101", "113–119", "75–77"],
  ["XXL", "116–122", "102–108", "120–126", "78–80"],
  ["XXXL", "123–129", "109–115", "127–133", "81–83"],
];
const SHOES = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46].map((s) => [String(s), (22.5 + (s - 36) * 0.65).toFixed(1)]);
const KIDS = [
  ["0-3m", "50–62"], ["3-6m", "62–68"], ["6-12m", "68–80"], ["1-2y", "80–92"], ["2-3y", "92–98"], ["3-4y", "98–104"],
  ["4-5y", "104–110"], ["5-6y", "110–116"], ["6-7y", "116–122"], ["7-8y", "122–128"], ["8-10y", "128–140"], ["10-12y", "140–152"], ["12-14y", "152–164"],
];

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-center text-sm">
        <thead className="bg-secondary text-xs text-muted-foreground"><tr>{head.map((h) => <th key={h} className="p-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y">{rows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} className={i === 0 ? "p-2 font-bold" : "p-2"}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** Size guide modal with cm tables for the product's size type. */
export function SizeGuide({ type }: { type: SizeType }) {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
  if (type === "none") return null;
  return (
    <Dialog>
      <DialogTrigger className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline">
        <Ruler className="h-4 w-4" />{t("size_guide")}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{t("size_guide")} {ar ? "(سم)" : "(cm)"}</DialogTitle></DialogHeader>
        {type === "clothes" && <Table head={ar ? ["المقاس", "الصدر", "الوسط", "الأرداف", "الطول"] : ["Size", "Chest", "Waist", "Hips", "Length"]} rows={CLOTHES} />}
        {type === "shoes" && <Table head={ar ? ["المقاس", "طول القدم"] : ["Size (EU)", "Foot length"]} rows={SHOES} />}
        {type === "kids" && <Table head={ar ? ["السن", "الطول"] : ["Age", "Height"]} rows={KIDS} />}
        <p className="text-xs text-muted-foreground">{ar ? "القياسات تقريبية وقد تختلف قليلاً حسب الموديل." : "Measurements are approximate and may vary by style."}</p>
      </DialogContent>
    </Dialog>
  );
}
