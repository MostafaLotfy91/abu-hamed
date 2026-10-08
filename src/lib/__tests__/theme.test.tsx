import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_SCRIPT, ThemeProvider, ThemeToggle, resolveTheme } from "../theme";

function mockSystemDark(dark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: dark, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  vi.unstubAllGlobals();
});

describe("theme", () => {
  it("resolves the choice against the device setting", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("head script applies the saved or system theme before React runs", () => {
    mockSystemDark(true);
    new Function(THEME_SCRIPT)();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    localStorage.setItem("app.theme", "light");
    new Function(THEME_SCRIPT)();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("the toggle switches the theme and remembers it", () => {
    mockSystemDark(false);
    render(
      <ThemeProvider>
        <ThemeToggle ar={false} />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dark mode" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("app.theme")).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: "Light mode" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("app.theme")).toBe("light");
  });
});
