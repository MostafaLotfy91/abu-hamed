import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Table query (server-side paging): supabase.from(t).select("*", { count }).order()[.eq/.or]().range() -> one row.
const inserted = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("@/integrations/supabase/client", () => {
  const rows = [{ id: "1", code: "SALE", value: 10, image_url: null, is_active: true }];
  const chain = {
    select: () => chain,
    order: () => chain,
    eq: () => chain,
    or: () => chain,
    range: async () => ({ data: rows, error: null, count: rows.length }),
    insert: async (payload: Record<string, unknown>) => {
      inserted.push(payload);
      return { error: null };
    },
  };
  return { supabase: { from: () => chain } };
});

import { CrudPage, type Field } from "../CrudPage";

const fields: Field[] = [
  { key: "code", label: "Code", required: true, list: true },
  { key: "value", label: "Value", type: "number", list: true },
  { key: "kind", label: "Type", type: "select", options: [{ value: "a", label: "A" }] },
  { key: "notes", label: "Notes", type: "textarea" },
  { key: "image_url", label: "Image", type: "image" },
  { key: "is_active", label: "Active", type: "bool", list: true },
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CrudPage table="coupons" title="Coupons" fields={fields} />
    </QueryClientProvider>,
  );
}

describe("CrudPage accessibility", () => {
  it("row edit and delete icon buttons have accessible names (phone card and table)", async () => {
    renderPage();
    // Both layouts are in the DOM (CSS shows one); jsdom applies no CSS, so both are found.
    expect(await screen.findAllByRole("button", { name: "تعديل / Edit" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "حذف / Delete" })).toHaveLength(2);
  });

  it("phone card shows the title and the other columns as label/value lines", async () => {
    renderPage();
    const card = (await screen.findAllByRole("listitem"))[0];
    expect(card).toHaveTextContent("SALE");
    expect(card).toHaveTextContent("Value");
    expect(card).toHaveTextContent("10");
  });

  it("every form control in the edit dialog is reachable by its label", async () => {
    renderPage();
    fireEvent.click((await screen.findAllByRole("button", { name: "تعديل / Edit" }))[0]);
    expect(screen.getByLabelText("Code *")).toHaveValue("SALE");
    expect(screen.getByLabelText("Value")).toHaveValue(10);
    expect(screen.getByLabelText("Type").tagName).toBe("SELECT");
    expect(screen.getByLabelText("Notes").tagName).toBe("TEXTAREA");
    expect(screen.getByRole("switch", { name: "Active" })).toBeInTheDocument();
    expect(screen.getByLabelText("Image — Upload / رفع")).toHaveAttribute("type", "file");
  });
});

describe("CrudPage save", () => {
  it("sends an unselected option and empty text as null, not an empty string", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Add / إضافة" }));
    fireEvent.change(screen.getByLabelText("Code *"), { target: { value: "NEW" } });
    fireEvent.click(screen.getByRole("button", { name: "Save / حفظ" }));
    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0]).toMatchObject({ code: "NEW", kind: null, notes: null });
  });
});
