export const SAFE_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

const SAFE_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export function isAllowedEmbeddedImageFile(file: File): boolean {
  return SAFE_IMAGE_MIME_TYPES.has(file.type.toLowerCase());
}

export function isSafeImageDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(value)
  );
}

/**
 * Either a safe data URL (legacy / pre-migration) or an https URL from
 * the image-upload service. https is the new default — see
 * `src/lib/storage/uploadImage.ts`. Stays narrow on purpose so we can't
 * accidentally accept javascript:, blob: from arbitrary origins, etc.
 */
export function isSafeImageRef(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (isSafeImageDataUrl(value)) return true;
  if (!/^https:\/\//i.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
