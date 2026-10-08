import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CategoryImage } from "../CategoryImage";
import { categoryIcon, usableImage } from "@/lib/category-image";

const STORAGE = "https://example.supabase.co/storage/v1/object/public/store-media/catalog/men.jpg";

describe("usableImage", () => {
  it("accepts absolute http(s) URLs", () => {
    expect(usableImage(STORAGE)).toBe(STORAGE);
    expect(usableImage(` ${STORAGE} `)).toBe(STORAGE);
  });
  it("treats empty, old Lovable paths and invalid paths as no image", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "   ",
      "/__l5e/assets-v1/abc/men.jpg",
      "catalog/men.jpg",
      "/images/men.jpg",
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "not a url",
    ])
      expect(usableImage(bad), String(bad)).toBeNull();
  });
});

describe("CategoryImage", () => {
  const fallback = () => document.querySelector('[data-category-image="fallback"]');
  const photo = () => document.querySelector('[data-category-image="photo"]');

  it("shows the image with lazy loading and fixed size", () => {
    render(<CategoryImage src={STORAGE} name="رجالي" profileKey="clothes" />);
    const img = photo() as HTMLImageElement;
    expect(img.src).toBe(STORAGE);
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("width")).toBeTruthy();
    expect(fallback()).toBeNull();
  });

  it("empty or invalid path: designed fallback with the name", () => {
    render(<CategoryImage src="/__l5e/old.jpg" name="قمصان" profileKey="clothes" />);
    expect(photo()).toBeNull();
    expect(fallback()).not.toBeNull();
    expect(screen.getByText("قمصان")).toBeInTheDocument();
  });

  it("image that fails to load switches to the fallback", () => {
    render(<CategoryImage src={STORAGE} name="عطور" profileKey="perfume" />);
    fireEvent.error(photo()!);
    expect(photo()).toBeNull();
    expect(fallback()).not.toBeNull();
  });

  it("can leave the name to the surrounding card", () => {
    render(<CategoryImage src={null} name="أحذية" profileKey="shoes" showName={false} />);
    expect(screen.queryByText("أحذية")).toBeNull();
    expect(fallback()).toHaveAttribute("aria-hidden", "true");
  });

  it("picks an icon per category type, with a general default", () => {
    expect(categoryIcon("perfume")).not.toBe(categoryIcon("shoes"));
    expect(categoryIcon("unknown")).toBe(categoryIcon("general"));
    expect(categoryIcon(null)).toBe(categoryIcon("general"));
  });
});
