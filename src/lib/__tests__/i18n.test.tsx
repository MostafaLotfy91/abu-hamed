import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "../i18n";

function Probe() {
  const { lang, setLang } = useI18n();
  return <button onClick={() => setLang(lang === "ar" ? "en" : "ar")}>{lang}</button>;
}

afterEach(() => localStorage.clear());

describe("I18nProvider language choice", () => {
  it("uses the store default when the visitor never chose", () => {
    render(
      <I18nProvider defaultLang="ar">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByRole("button").textContent).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("a saved choice survives a reload even when the store default differs", () => {
    localStorage.setItem("app.lang", "en");
    render(
      <I18nProvider defaultLang="ar">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByRole("button").textContent).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.documentElement.lang).toBe("en");
  });

  it("a later change of the store default does not override the visitor's choice", () => {
    localStorage.setItem("app.lang", "en");
    const { rerender } = render(
      <I18nProvider defaultLang="ar">
        <Probe />
      </I18nProvider>,
    );
    rerender(
      <I18nProvider defaultLang="ar">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByRole("button").textContent).toBe("en");
  });

  it("toggling saves the choice", () => {
    render(
      <I18nProvider defaultLang="ar">
        <Probe />
      </I18nProvider>,
    );
    act(() => screen.getByRole("button").click());
    expect(localStorage.getItem("app.lang")).toBe("en");
    expect(screen.getByRole("button").textContent).toBe("en");
  });
});
