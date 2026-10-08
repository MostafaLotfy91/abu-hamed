import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Countdown, timeLeft } from "../Countdown";

vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ lang: "ar" }) }));

afterEach(() => vi.useRealTimers());

describe("Countdown", () => {
  it("splits the time left into days and h:m:s", () => {
    const now = Date.parse("2026-10-09T10:00:00Z");
    expect(timeLeft("2026-10-11T15:12:09Z", now)).toEqual({ days: 2, h: 5, m: 12, s: 9 });
    expect(timeLeft("2026-10-09T09:00:00Z", now)).toEqual({ days: 0, h: 0, m: 0, s: 0 });
  });

  it("shows Arabic digits and a day count for sales longer than a day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-10-09T10:00:00Z"));
    render(<Countdown to="2026-10-11T15:12:09Z" />);
    expect(screen.getByRole("timer")).toHaveTextContent("يومان");
    expect(screen.getByRole("timer")).toHaveTextContent("٠٥١٢٠٩");
  });
});
