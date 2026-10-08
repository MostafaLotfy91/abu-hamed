import { describe, expect, it } from "vitest";
import {
  clockOffset,
  formatCountdown,
  newOfferIds,
  outcomeOf,
  secondsLeft,
  type DriverOffer,
} from "../driver-offers";

const offer = (id: string) => ({ offer_id: id }) as DriverOffer;

describe("driver offer helpers", () => {
  it("counts down in whole seconds using the server clock offset", () => {
    const now = Date.parse("2026-10-08T12:00:00Z");
    // Device clock is 1 h fast: offset -3600 s.
    const offset = clockOffset("2026-10-08T12:00:00Z", now + 3_600_000);
    expect(offset).toBe(-3_600_000);
    expect(secondsLeft("2026-10-08T12:02:00Z", offset, now + 3_600_000)).toBe(120);
    expect(secondsLeft("2026-10-08T12:00:00.400Z", 0, now)).toBe(1);
    expect(secondsLeft("2026-10-08T11:59:00Z", 0, now)).toBe(0);
  });

  it("formats the countdown as m:ss", () => {
    expect(formatCountdown(120)).toBe("2:00");
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(0)).toBe("0:00");
  });

  it("finds offers that were not seen before", () => {
    expect(newOfferIds(new Set(["a"]), [offer("a"), offer("b")])).toEqual(["b"]);
    expect(newOfferIds(new Set(), [])).toEqual([]);
  });

  it("maps server statuses and RPC results to what the driver is told", () => {
    expect(outcomeOf("expired")).toBe("expired");
    expect(outcomeOf("cancelled")).toBe("taken");
    expect(outcomeOf("taken")).toBe("taken");
    expect(outcomeOf("accepted")).toBe("accepted");
    expect(outcomeOf("rejected")).toBe("rejected");
    expect(outcomeOf("offered")).toBeNull();
  });
});
