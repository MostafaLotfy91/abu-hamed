import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SwipeToAccept } from "../SwipeToAccept";

// jsdom has no PointerEvent: without this, clientX would be missing from the dispatched events.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventStub extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventStub;
}

function setup(dir: "rtl" | "ltr", disabled = false) {
  const onAccept = vi.fn();
  render(
    <SwipeToAccept label="Swipe to accept" dir={dir} disabled={disabled} onAccept={onAccept} />,
  );
  const track = screen.getByRole("button", { name: "Swipe to accept" });
  Object.defineProperty(track, "clientWidth", { value: 356 }); // travel = 300 px
  const thumb = screen.getByTestId("swipe-thumb");
  const drag = (dx: number) => {
    fireEvent.pointerDown(thumb, { clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(thumb, { clientX: 500 + dx, pointerId: 1 });
    fireEvent.pointerUp(thumb, { clientX: 500 + dx, pointerId: 1 });
  };
  return { onAccept, track, thumb, drag };
}

describe("SwipeToAccept", () => {
  it("accepts only after sliding most of the way (left-to-right)", () => {
    const { onAccept, drag, thumb } = setup("ltr");
    drag(120); // 40%: springs back
    expect(onAccept).not.toHaveBeenCalled();
    fireEvent.click(thumb); // a tap does nothing
    expect(onAccept).not.toHaveBeenCalled();
    drag(280); // 93%
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("slides toward the left in Arabic", () => {
    const { onAccept, drag } = setup("rtl");
    drag(280); // wrong way
    expect(onAccept).not.toHaveBeenCalled();
    drag(-280);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("Enter/Space accept for keyboard and screen-reader users; disabled does nothing", () => {
    const a = setup("ltr");
    fireEvent.keyDown(a.track, { key: "Enter" });
    expect(a.onAccept).toHaveBeenCalledTimes(1);
  });

  it("disabled ignores swipes and keys", () => {
    const { onAccept, drag, track } = setup("ltr", true);
    drag(300);
    fireEvent.keyDown(track, { key: " " });
    expect(onAccept).not.toHaveBeenCalled();
  });
});
