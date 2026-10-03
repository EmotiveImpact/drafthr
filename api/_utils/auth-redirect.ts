/** Same-origin destinations only; reject auth entry points to avoid callback loops. */
export function safeAuthReturnTo(value: string | null | undefined): string {
  if (!value || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") ||
      /[\\\u0000-\u0020]/.test(value)) return "/";
  const parsed = new URL(value, "https://app.drafthr.local");
  if (parsed.origin !== "https://app.drafthr.local" || parsed.pathname.startsWith("/auth/") ||
      parsed.pathname.startsWith("/sign-in") || parsed.pathname.startsWith("/api/")) return "/";
  return parsed.pathname + parsed.search + parsed.hash;
}
