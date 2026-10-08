import { describe, expect, it } from "vitest";
import { compareWindows, pctChange } from "../stats";

const series = (totals: number[]) => totals.map((total, i) => ({ day: `d${i}`, total }));

describe("dashboard comparisons", () => {
  it("splits the 14-day series into today/yesterday and the last two weeks", () => {
    const w = compareWindows(series([1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 4]));
    expect(w).toEqual({ today: 4, yesterday: 3, last7: 17, prev7: 7 });
  });

  it("handles short or empty series", () => {
    expect(compareWindows([])).toEqual({ today: 0, yesterday: 0, last7: 0, prev7: 0 });
    expect(compareWindows(series([5]))).toEqual({ today: 5, yesterday: 0, last7: 5, prev7: 0 });
  });

  it("percent change, none when there is no previous figure", () => {
    expect(pctChange(112, 100)).toBe(12);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(0, 0)).toBeNull();
  });
});
