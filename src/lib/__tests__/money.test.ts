import { describe, expect, it } from "vitest";
import {
  commissionMinor,
  differenceMinor,
  fromMinor,
  parseAmountInput,
  sumMinor,
  toMinor,
} from "../money";

describe("minor units", () => {
  it("reads database strings and numbers exactly", () => {
    expect(toMinor("130.00")).toBe(13000);
    expect(toMinor("-34.75")).toBe(-3475);
    expect(toMinor(0.1)).toBe(10);
    expect(toMinor("0")).toBe(0);
    expect(toMinor(null)).toBe(0);
    expect(toMinor("12")).toBe(1200);
    expect(toMinor(".5")).toBe(50);
    expect(() => toMinor("abc")).toThrow();
    expect(() => toMinor(Number.NaN)).toThrow();
  });

  it("rounds half away from zero like Postgres round(x, 2)", () => {
    expect(toMinor("1.005")).toBe(101);
    expect(toMinor(1.005)).toBe(101); // the float is 1.00499999...; read as written
    expect(toMinor("-1.005")).toBe(-101);
    expect(toMinor("2.674")).toBe(267);
    expect(toMinor("9.999")).toBe(1000);
  });

  it("sums without floating-point drift", () => {
    // 0.1 + 0.2 !== 0.3 in floats; in minor units it is exact.
    expect(sumMinor([0.1, 0.2])).toBe(30);
    expect(fromMinor(sumMinor([0.1, 0.2]))).toBe(0.3);
    const many = Array.from({ length: 1000 }, () => "0.01");
    expect(sumMinor(many)).toBe(1000);
    expect(
      fromMinor(
        sumMinor([
          "130.00",
          "-20.00",
          "-150.00",
          "25.25",
          "-130.00",
          "20.00",
          "130.00",
          "-20.00",
          "0.00",
          "-20.00",
        ]),
      ),
    ).toBe(-34.75);
  });

  it("converts back to 2-decimal numbers", () => {
    expect(fromMinor(13000)).toBe(130);
    expect(fromMinor(-3475)).toBe(-34.75);
    expect(fromMinor(1)).toBe(0.01);
  });
});

describe("commission", () => {
  it("fixed amount", () => {
    expect(commissionMinor("fixed", 20, 30)).toBe(2000);
    expect(commissionMinor("fixed", "7.005", 0)).toBe(701);
  });

  it("percent of the delivery fee, matching the database rounding", () => {
    expect(commissionMinor("percent_of_delivery_fee", 33.33, 30)).toBe(1000); // 9.999 -> 10.00
    expect(commissionMinor("percent_of_delivery_fee", 12.5, 25)).toBe(313); // 3.125 -> 3.13
    expect(commissionMinor("percent_of_delivery_fee", 10, 0.05)).toBe(1); // 0.005 -> 0.01
    expect(commissionMinor("percent_of_delivery_fee", 50, 0)).toBe(0);
    expect(commissionMinor("percent_of_delivery_fee", 100, "45.50")).toBe(4550);
  });
});

describe("amount input", () => {
  it("accepts Arabic digits, separators and up to 2 decimals", () => {
    expect(parseAmountInput("130")).toBe(13000);
    expect(parseAmountInput("١٣٠")).toBe(13000);
    expect(parseAmountInput("١٢٫٥")).toBe(1250);
    expect(parseAmountInput("1,250.75")).toBe(125075);
    expect(parseAmountInput(" 99.9 ")).toBe(9990);
  });

  it("rejects empty, text, 3 decimals and negatives (unless allowed)", () => {
    for (const bad of ["", "abc", "1.234", "1.", "-5", "--1"])
      expect(parseAmountInput(bad)).toBeNull();
    expect(parseAmountInput("-5", { allowNegative: true })).toBe(-500);
  });

  it("settlement difference: short is negative", () => {
    expect(differenceMinor(10000, 11000)).toBe(-1000);
    expect(differenceMinor(11000, 11000)).toBe(0);
  });
});
