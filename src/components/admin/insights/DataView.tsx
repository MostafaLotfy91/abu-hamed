import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { InsightRow } from "@/lib/insights-types";

const NUM_PREF = ["revenue", "sales", "qty", "rate", "count", "orders", "sold", "stock", "returns"];

/** Short table plus a bar chart when the rows have a label + numeric column. */
export function DataView({
  rows,
  title,
  chart = true,
}: {
  rows: InsightRow[];
  title?: string;
  chart?: boolean;
}) {
  if (!rows.length)
    return <p className="text-sm text-muted-foreground">{title ? `${title}: ` : ""}—</p>;
  const cols = Object.keys(rows[0]);
  const label = cols.find((c) => typeof rows[0][c] === "string");
  const value = NUM_PREF.find((c) => cols.includes(c) && rows.some((r) => Number(r[c]) > 0));
  const data = rows
    .slice(0, 15)
    .map((r) => ({ ...r, [value ?? "_"]: Number(r[value ?? "_"] ?? 0) }));
  return (
    <div className="space-y-2 rounded-xl border bg-background p-3">
      {title && <p className="text-xs font-bold text-muted-foreground">{title}</p>}
      {chart && label && value && rows.length > 1 && (
        <div className="h-44" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <XAxis
                dataKey={label}
                fontSize={10}
                interval={0}
                tickFormatter={(v: string) => String(v).slice(0, 10)}
              />
              <YAxis fontSize={10} />
              <Tooltip />
              <Bar dataKey={value} fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="max-h-64 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} className="border-b p-1.5 text-start font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 50).map((r, i) => (
              <tr key={i} className="odd:bg-muted/40">
                {cols.map((c) => (
                  <td key={c} className="p-1.5">
                    {r[c] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
