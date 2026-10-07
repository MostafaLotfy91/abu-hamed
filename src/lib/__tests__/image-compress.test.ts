import { describe, expect, it } from "vitest";
import { assertImageFile, MAX_IMAGE_INPUT_BYTES } from "../image-compress";

const fileOf = (type: string, size = 10) => new File([new Uint8Array(size)], "x", { type });

describe("assertImageFile", () => {
  it("accepts allowed image types", () => {
    for (const t of ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]) {
      expect(() => assertImageFile(fileOf(t))).not.toThrow();
    }
  });
  it("rejects SVG, HTML and unknown types", () => {
    expect(() => assertImageFile(fileOf("image/svg+xml"))).toThrow(/Unsupported/);
    expect(() => assertImageFile(fileOf("text/html"))).toThrow(/Unsupported/);
    expect(() => assertImageFile(fileOf(""))).toThrow(/Unsupported/);
  });
  it("rejects files over the size limit", () => {
    expect(() => assertImageFile(fileOf("image/jpeg", MAX_IMAGE_INPUT_BYTES + 1))).toThrow(/20 MB/);
  });
});
