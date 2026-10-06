import { describe, expect, it } from "vitest";
import { restockQty } from "../insights-types";

describe("restockQty", () => {
  it("covers 21 days at the recent pace minus stock", () => {
    expect(restockQty(14, 14, 5)).toBe(16);
  });
  it("suggests nothing when stock already covers demand", () => {
    expect(restockQty(14, 14, 30)).toBe(0);
  });
});
