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
