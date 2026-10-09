import { describe, expect, it } from "vitest";
import { cashTableRows, dailySummaryRows, ledgerRows, type CashRow } from "../driver-cash-export";
import { financeSettingsError } from "../finance-settings";
import { ledgerTypeLabel } from "../ledger-labels";

const row = (over: Partial<CashRow> = {}): CashRow => ({
  driver_id: "d1",
  full_name: "أحمد",
  phone: "01000000000",
  orders_delivered: 2,
  cod_total: "260.00",
  commission_earned: "40.00",
  settlements_paid: "0.00",
  adjustments: "0.00",
  cash_held: "260.00",
  owed_to_store: "220.00",
  commission_payable: "0.00",
  last_settlement_at: null,
  over_limit: false,
  unsettled_from_before: false,
  pending_reviews: 0,
  ...over,
});

describe("Excel export", () => {
  it("escapes text that a spreadsheet would run as a formula (= + - @), keeps amounts numeric", () => {
    const rows = cashTableRows(
      [
        row({ full_name: '=HYPERLINK("http://evil","x")', phone: "+201000" }),
        row({ full_name: "@SUM(A1)", phone: "-1+1", owed_to_store: "-34.75" }),
      ],
      false,
    );
    expect(rows[1][0]).toBe(`'=HYPERLINK("http://evil","x")`);
    expect(rows[1][1]).toBe("'+201000");
    expect(rows[2][0]).toBe("'@SUM(A1)");
    expect(rows[2][1]).toBe("'-1+1");
    // Numbers stay numbers, negative ones included (not text, not escaped).
    expect(rows[2][8]).toBe(-34.75);
    expect(rows[1][3]).toBe(260);
  });

  it("ledger sheet: labels, escaped notes and an exact total", () => {
    const rows = ledgerRows(
      [
        {
          created_at: "2026-10-09T10:00:00Z",
          type: "cod_collected",
          amount: "0.10",
          order_number: 7,
          note: null,
        },
        {
          created_at: "2026-10-09T10:00:00Z",
          type: "commission_earned",
          amount: "0.20",
          order_number: 7,
          note: "=cmd",
        },
        {
          created_at: "2026-10-09T11:00:00Z",
          type: "reversal",
          kind: "cod_collected",
          amount: "-0.10",
          order_number: 7,
          note: "",
        },
      ],
      true,
    );
    expect(rows[1][2]).toBe("تحصيل كاش");
    expect(rows[2][5]).toBe("'=cmd");
    expect(rows[3][2]).toBe("إلغاء قيد: تحصيل كاش");
    expect(rows.at(-1)).toEqual(["", "", "الإجمالي", "", 0.2, ""]);
  });

  it("daily summary totals across drivers", () => {
    const s = dailySummaryRows(
      "2026-10-09",
      [
        row(),
        row({
          driver_id: "d2",
          orders_delivered: 1,
          cod_total: "130.10",
          commission_earned: "20.20",
          owed_to_store: "0.10",
          over_limit: true,
        }),
      ],
      false,
    );
    expect(Object.fromEntries(s)).toEqual({
      "Daily report": "2026-10-09",
      "Orders delivered": 3,
      "COD total": 390.1,
      Commissions: 60.2,
      "Settlements received": 0,
      Adjustments: 0,
      "Outstanding balances now": 220.1,
      "Drivers over the cash limit": 1,
    });
  });
});

describe("labels", () => {
  it("names every entry type in both languages", () => {
    expect(ledgerTypeLabel("settlement_paid", false)).toBe("Settlement");
    expect(ledgerTypeLabel("reversal", false, "commission_earned")).toBe("Reversal: Commission");
    expect(ledgerTypeLabel("unknown", true)).toBe("unknown");
  });
});

describe("finance settings validation", () => {
  const ok = {
    driver_commission_type: "fixed",
    driver_commission_value: 20,
    driver_cash_limit: 0,
    timezone: "Africa/Cairo",
  };
  it("accepts valid settings", () => {
    expect(financeSettingsError(ok)).toBeNull();
    expect(
      financeSettingsError({
        ...ok,
        driver_commission_type: "percent_of_delivery_fee",
        driver_commission_value: 100,
      }),
    ).toBeNull();
  });
  it("rejects bad values with a bilingual message", () => {
    expect(financeSettingsError({ ...ok, driver_commission_value: -1 })).toMatch(
      /Invalid commission/,
    );
    expect(financeSettingsError({ ...ok, driver_commission_value: 1.234 })).toMatch(
      /Invalid commission/,
    );
    expect(
      financeSettingsError({
        ...ok,
        driver_commission_type: "percent_of_delivery_fee",
        driver_commission_value: 100.5,
      }),
    ).toMatch(/0–100/);
    expect(financeSettingsError({ ...ok, driver_cash_limit: null })).toMatch(/cash limit/);
    expect(financeSettingsError({ ...ok, timezone: "Cairo time" })).toMatch(/timezone/);
  });
});
