import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "../button";

describe("Button before hydration", () => {
  it("server-renders submit buttons disabled, so an early click cannot trigger a native form submit", () => {
    expect(renderToString(<Button type="submit">Go</Button>)).toMatch(/ disabled=""/);
    expect(renderToString(<Button type="button">Go</Button>)).not.toMatch(/ disabled=""/);
    expect(renderToString(<Button>Go</Button>)).not.toMatch(/ disabled=""/);
  });

  it("enables submit buttons on the client and keeps an explicit disabled", () => {
    render(
      <>
        <Button type="submit">Send</Button>
        <Button type="submit" disabled>
          Busy
        </Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Busy" })).toBeDisabled();
  });
});
