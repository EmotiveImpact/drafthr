/**
 * Verify a stored RFC 3161 TimeStampToken against an expected SHA-256 hash.
 *
 * Anyone holding the original PDF (or its hash) plus the TSR we returned at
 * export time can confirm:
 *   1. the TSR is well-formed, granted, and parseable as RFC 3161 + CMS;
 *   2. the SHA-256 inside the signed TSTInfo matches the PDF they have;
 *   3. the UTC moment FreeTSA bound the hash to.
 *
 * That's the tribunal-ready primitive: "this exact PDF existed at this exact
 * moment, attested by an independent trusted timestamp authority."
 *
 * Note: signature verification of FreeTSA's CMS envelope (i.e. validating the
 * cert chain back to FreeTSA's root) is intentionally deferred. Callers who
 * need stronger proof can run `openssl ts -verify` against the TSR.
 */
import { rateLimit } from "../_utils/rate-limit.js";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../_utils/request.js";
import { parseTsr } from "../_utils/tsa.js";

type VerifyRequest = {
  tsr_base64?: unknown;
  expected_sha256?: unknown;
};

export async function POST(req: Request): Promise<Response> {
  const originError = enforceSameOrigin(req);
  if (originError) return originError;
  const rateLimitError = rateLimit(req, { name: "verify-tsr", max: 30, windowMs: 60_000 });
  if (rateLimitError) return rateLimitError;

  const parsed = await readJsonRequest<VerifyRequest>(req, 200_000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  if (typeof body.tsr_base64 !== "string" || !body.tsr_base64) {
    return jsonError("tsr_base64 required", 400);
  }
  if (typeof body.expected_sha256 !== "string" || !/^[0-9a-fA-F]{64}$/.test(body.expected_sha256)) {
    return jsonError("expected_sha256 must be a 64-char hex string", 400);
  }

  let tsr: Buffer;
  try {
    tsr = Buffer.from(body.tsr_base64, "base64");
  } catch {
    return jsonError("tsr_base64 must be valid base64", 400);
  }
  if (tsr.byteLength === 0) return jsonError("tsr_base64 decoded to 0 bytes", 400);

  const result = parseTsr(tsr);
  if (!result.ok) {
    return new Response(JSON.stringify({ ok: false, reason: result.reason }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  if (result.sha256Hex.toLowerCase() !== body.expected_sha256.toLowerCase()) {
    return new Response(
      JSON.stringify({
        ok: false,
        reason: "hash_mismatch",
        signed_sha256: result.sha256Hex,
        expected_sha256: body.expected_sha256.toLowerCase(),
      }),
      { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      signed_at: result.signedAtUtc.toISOString(),
      tsa: result.tsaName,
      sha256: result.sha256Hex,
    }),
    { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
  );
}
