import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/store/use-money", () => ({
  useMoney: () => (v: number) => `${v} EGP`,
}));

import { OfferAlert, OfferClosedNotice } from "../OfferAlert";
import type { DriverOffer } from "@/lib/driver-offers";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const offer: DriverOffer = {
  offer_id: "o1",
  order_id: "x",
  order_number: 1234,
  area: "مدينة نصر",
  city: "القاهرة",
  total: 450,
  payment_method: "cod",
  cod_amount: 450,
  items: 3,
  offered_at: "2026-10-08T12:00:00Z",
  expires_at: "2026-10-08T12:02:00Z",
  server_now: "2026-10-08T12:00:00Z",
};
const noop = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("OfferAlert", () => {
  it("shows order number, area, total, cash to collect and a countdown", () => {
    render(
      <OfferAlert
        offer={offer}
        offset={0}
        ar
        more={1}
        busy={false}
        onAccept={noop}
        onReject={noop}
      />,
    );
    expect(screen.getByRole("alertdialog", { name: "أوردر جديد #1234" })).toBeInTheDocument();
    expect(screen.getByText("مدينة نصر، القاهرة")).toBeInTheDocument();
    expect(screen.getAllByText("450 EGP")).toHaveLength(2); // total and cash to collect
    expect(screen.getByRole("timer")).toHaveTextContent("2:00");
    expect(screen.getByText("+1 عرض آخر في الانتظار")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(65_000));
    expect(screen.getByRole("timer")).toHaveTextContent("0:55");
  });

  it("accept and reject call back; both are disabled once time is up", () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    render(
      <OfferAlert
        offer={offer}
        offset={0}
        ar={false}
        more={0}
        busy={false}
        onAccept={onAccept}
        onReject={onReject}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(121_000));
    expect(screen.getByText("Time is up")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
  });

  it("counts down from server time when the phone clock is 1 h fast", () => {
    vi.setSystemTime(NOW + 3_600_000);
    render(
      <OfferAlert
        offer={offer}
        offset={-3_600_000}
        ar={false}
        more={0}
        busy={false}
        onAccept={noop}
        onReject={noop}
      />,
    );
    expect(screen.getByRole("timer")).toHaveTextContent("2:00");
  });

  it("shows paid-online instead of a cash amount for online orders", () => {
    render(
      <OfferAlert
        offer={{ ...offer, payment_method: "online", cod_amount: 0 }}
        offset={0}
        ar={false}
        more={0}
        busy={false}
        onAccept={noop}
        onReject={noop}
      />,
    );
    expect(screen.getByText("Paid online")).toBeInTheDocument();
  });
});

describe("OfferClosedNotice", () => {
  it("explains expired and taken offers, and dismisses itself", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <OfferClosedNotice outcome="expired" ar={false} onDismiss={onDismiss} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("The offer expired");
    rerender(<OfferClosedNotice outcome="taken" ar onDismiss={onDismiss} />);
    expect(screen.getByRole("status")).toHaveTextContent("اتسند لمندوب تاني");
    act(() => vi.advanceTimersByTime(8000));
    expect(onDismiss).toHaveBeenCalled();
  });
});
