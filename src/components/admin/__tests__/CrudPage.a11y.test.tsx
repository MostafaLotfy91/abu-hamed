import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Table query (server-side paging): supabase.from(t).select("*", { count }).order()[.eq/.or]().range() -> one row.
vi.mock("@/integrations/supabase/client", () => {
  const rows = [{ id: "1", code: "SALE", value: 10, image_url: null, is_active: true }];
  const chain = { select: () => chain, order: () => chain, eq: () => chain, or: () => chain, range: async () => ({ data: rows, error: null, count: rows.length }) };
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
  it("row edit and delete icon buttons have accessible names", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: "تعديل / Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "حذف / Delete" })).toBeInTheDocument();
  });

  it("every form control in the edit dialog is reachable by its label", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "تعديل / Edit" }));
    expect(screen.getByLabelText("Code *")).toHaveValue("SALE");
    expect(screen.getByLabelText("Value")).toHaveValue(10);
    expect(screen.getByLabelText("Type").tagName).toBe("SELECT");
    expect(screen.getByLabelText("Notes").tagName).toBe("TEXTAREA");
    expect(screen.getByRole("switch", { name: "Active" })).toBeInTheDocument();
    expect(screen.getByLabelText("Image — Upload / رفع")).toHaveAttribute("type", "file");
  });
});
