/** Only retry explicit throttling, not ambiguous writes or authorization errors.
 * Callers must capture their original workspace and reuse the same request IDs. */
export class StorageRateLimitError extends Error {
  constructor() { super("Storage is busy. Please retry later; your original data is preserved."); }
}

export async function rateLimitedRequest(request: () => Promise<Response>, assertCurrent: () => void): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    assertCurrent();
    const response = await request();
    assertCurrent();
    if (response.status !== 429) return response;
    const header = response.headers.get("Retry-After")?.trim();
    const parsed = header && /^\d+$/.test(header) ? Number(header) * 1000
      : header ? Date.parse(header) - Date.now() : NaN;
    const delay = Number.isNaN(parsed) ? 1000 * (attempt + 1) : Math.max(250, parsed);
    await response.body?.cancel();
    // Never shorten a provider's requested delay or retry indefinitely.
    if (attempt >= 2 || delay > 60_000) throw new StorageRateLimitError();
    const until = Date.now() + delay;
    while (Date.now() < until) {
      assertCurrent();
      await new Promise(resolve => setTimeout(resolve, Math.min(250, until - Date.now())));
    }
    assertCurrent();
  }
}
