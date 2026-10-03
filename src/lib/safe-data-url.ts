import { parsePrivateImageUrl } from "./storage/privateImageUrl";

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
  // Require at least one real base64 character in the payload. Whitespace is
  // tolerated (some encoders wrap long base64), but a whitespace-only payload
  // like "data:image/png;base64,   " must NOT pass this image-safety gate.
  return (
    typeof value === "string" &&
    /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,\s*[a-z0-9+/=][a-z0-9+/=\s]*$/i.test(value)
  );
}

/**
 * A safe data URL (legacy / local), an authenticated same-origin private
 * image URL, or a legacy https image URL. Never accept arbitrary relative
 * paths, javascript:, or blob: references.
 */
export function isSafeImageRef(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (isSafeImageDataUrl(value)) return true;
  if (parsePrivateImageUrl(value)) return true;
  if (!/^https:\/\//i.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
