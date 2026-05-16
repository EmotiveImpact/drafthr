/**
 * Subject Access Request (SAR / DSAR) endpoint — STUB.
 *
 * Wired in Phase B once WorkOS auth + Neon Postgres land. Until then,
 * this returns 503 so callers (any future "Download my data" / "Delete
 * my data" UI) get a clear message rather than a crash.
 *
 * UK GDPR Art. 15 right of access: response within 1 month, free of charge.
 * UK GDPR Art. 17 right to erasure: same window.
 *
 * In localStorage-only mode (current), all personal data lives in the
 * user's browser. Clearing site data is the erasure path.
 */

export const config = { runtime: "nodejs" };

const NOT_IMPLEMENTED = JSON.stringify({
  error:
    "DSAR endpoint requires a configured database. In localStorage-only mode, your data lives in your browser — clear site data to erase.",
});

export function GET(): Response {
  return new Response(NOT_IMPLEMENTED, {
    status: 503,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function DELETE(): Response {
  return new Response(NOT_IMPLEMENTED, {
    status: 503,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
