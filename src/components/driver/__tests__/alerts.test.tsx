import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertsOnboarding } from "../AlertsOnboarding";
import { useWakeLock } from "@/lib/driver-alerts";

describe("AlertsOnboarding", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("asks once (sound + notification permission), then remembers the choice", async () => {
    const requestPermission = vi.fn(async () => "granted" as NotificationPermission);
    vi.stubGlobal(
      "Notification",
      Object.assign(function () {}, { permission: "default", requestPermission }),
    );
    const { unmount } = render(<AlertsOnboarding ar={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Enable sound and notifications" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Notifications on");
    expect(requestPermission).toHaveBeenCalled();
    unmount();
    render(<AlertsOnboarding ar={false} />);
    expect(screen.queryByRole("button", { name: "Enable sound and notifications" })).toBeNull();
  });

  it("says when notifications are blocked", async () => {
    vi.stubGlobal(
      "Notification",
      Object.assign(function () {}, { permission: "denied", requestPermission: vi.fn() }),
    );
    render(<AlertsOnboarding ar={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Enable sound and notifications" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Notifications blocked");
  });
});

describe("useWakeLock", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "wakeLock");
  });

  it("reports unsupported when the browser has no Wake Lock API", () => {
    const { result } = renderHook(() => useWakeLock(true));
    expect(result.current).toBe("unsupported");
  });

  it("holds the screen lock while on and releases it when off", async () => {
    const release = vi.fn(async () => {});
    const sentinel = { released: false, release, addEventListener: vi.fn() };
    const request = vi.fn(async () => sentinel);
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
    const { result, rerender } = renderHook(({ on }) => useWakeLock(on), {
      initialProps: { on: true },
    });
    await waitFor(() => expect(result.current).toBe("active"));
    expect(request).toHaveBeenCalledWith("screen");
    await act(async () => rerender({ on: false }));
    expect(release).toHaveBeenCalled();
    expect(result.current).toBe("off");
  });
});
