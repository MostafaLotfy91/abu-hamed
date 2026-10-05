import { createFileRoute } from "@tanstack/react-router";
import { CrudPage } from "@/components/admin/CrudPage";

export const Route = createFileRoute("/_authenticated/admin/coupons")({ component: Page });

function Page() {
  return (
    <CrudPage table="coupons" title="الكوبونات / Coupons" fields={[
      { key: "code", label: "Code", required: true, list: true },
      { key: "discount_type", label: "Type", type: "select", required: true, default: "percent", list: true, options: [{ value: "percent", label: "% Percent" }, { value: "fixed", label: "Fixed amount" }] },
      { key: "value", label: "Value", type: "number", required: true, list: true },
      { key: "min_order", label: "Min order", type: "number", default: 0, list: true },
      { key: "max_discount", label: "Max discount", type: "number" },
      { key: "max_uses", label: "Max uses", type: "number" },
      { key: "used_count", label: "Used", type: "number", default: 0, list: true },
      { key: "starts_at", label: "Starts", type: "datetime" },
      { key: "ends_at", label: "Ends", type: "datetime" },
      { key: "is_active", label: "Active", type: "bool", list: true },
    ]} />
  );
}
