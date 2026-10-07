/** Image types admins may upload; everything is re-encoded to WebP before it reaches storage. */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
];
/** Limit on the original file picked by the admin (the uploaded WebP is much smaller). */
export const MAX_IMAGE_INPUT_BYTES = 20 * 1024 * 1024;

/** Throws a bilingual error when the picked file isn't an allowed image or is too large. */
export function assertImageFile(file: File) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("نوع الملف غير مدعوم (JPG, PNG, WebP, AVIF, GIF) / Unsupported file type");
  }
  if (file.size > MAX_IMAGE_INPUT_BYTES) {
    throw new Error("الصورة أكبر من 20 ميجا / Image is larger than 20 MB");
  }
}

/** Client-side resize + WebP conversion before upload. */
export async function toWebp(file: Blob, maxSide: number, quality = 0.8): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("webp failed"))), "image/webp", quality),
  );
}
