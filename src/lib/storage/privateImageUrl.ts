/** A same-origin image URL; the Blob URL itself is never exposed to the browser. */
const IMAGE_ROUTE = "/api/upload/image";
const PRIVATE_IMAGE_PATH_RE =
  /^letterheads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{64})\.(png|jpg|webp|gif)$/;

export function isTenantPrivateImagePath(pathname: string, tenantId: string): boolean {
  return PRIVATE_IMAGE_PATH_RE.exec(pathname)?.[1] === tenantId.toLowerCase();
}

export function privateImageUrl(pathname: string): string {
  return `${IMAGE_ROUTE}?path=${encodeURIComponent(pathname)}`;
}

export function parsePrivateImageUrl(value: string): string | null {
  if (!value.startsWith(`${IMAGE_ROUTE}?`)) return null;
  let url: URL;
  try {
    url = new URL(value, "https://private-image.invalid");
  } catch {
    return null;
  }
  if (url.pathname !== IMAGE_ROUTE || url.hash || [...url.searchParams.keys()].join() !== "path") {
    return null;
  }
  const pathname = url.searchParams.get("path") ?? "";
  return PRIVATE_IMAGE_PATH_RE.test(pathname) ? pathname : null;
}
