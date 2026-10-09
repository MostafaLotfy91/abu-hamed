import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const { themeVars } = await import("../store-settings");
const { readableOn } = await import("../color-contrast");

describe("text colour on a store colour (WCAG contrast)", () => {
  it("picks charcoal or ivory, whichever has more contrast", () => {
    expect(readableOn("#1c1a18")).toBe("#faf7f2"); // charcoal button: ivory text
    expect(readableOn("#3e1e1e")).toBe("#faf7f2"); // deep maroon: ivory text
    expect(readableOn("#b08d57")).toBe("#1c1a18"); // antique gold: charcoal text (white would be ~3:1)
    expect(readableOn("#faf7f2")).toBe("#1c1a18");
    expect(readableOn("#6b7280")).toBe("#faf7f2");
  });

  it("falls back to ivory for anything that is not #rrggbb", () => {
    expect(readableOn("red")).toBe("#faf7f2");
    expect(readableOn("#fff")).toBe("#faf7f2");
  });

  it("store colours become the brand variables", () => {
    expect(themeVars({ primary_color: "#1c1a18", secondary_color: "#b08d57" })).toEqual({
      "--brand-primary": "#1c1a18",
      "--brand-primary-foreground": "#faf7f2",
      "--brand-secondary": "#b08d57",
      "--brand-secondary-foreground": "#1c1a18",
    });
  });
});
