/**
 * POST /api/sign/manifest
 *
 * Sign an export-pack manifest with the active Ed25519 signer (AWS KMS when
 * SIGNING_KMS_KEY_ID is configured, the in-process local signer otherwise),
 * stamp it with a fresh RFC 3161 TimeStampToken from FreeTSA, and return a
 * PAdES-B-T-style CMS SignedData blob ready to be written into the export
 * ZIP as `manifest.sig`.
 *
 * The pack builder (src/lib/export/pack.ts) is browser-side; it calls this
 * endpoint with the canonical manifest JSON it just built, then drops the
 * returned CMS bytes into the ZIP alongside `manifest.json`.
 *
 * Audit: every successful signing emits a `draft.signed_with_kms` audit
 * event (or `draft.signed_local` for the dev path). The WorkOS Audit Logs
 * sink that sibling task 2B is wiring up will pick the same kind up for
 * free.
 */
import { createHash } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { rateLimit } from "../_utils/rate-limit.js";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../_utils/request.js";
import { requireSessionAndTenant } from "../_utils/session-with-tenant.js";
import { parseTsr, requestTsr } from "../_utils/tsa.js";
import { appendAuditEvent } from "../../src/db/audit.js";
import { getDb } from "../../src/db/index.js";
import { drafts } from "../../src/db/schema.js";
import { buildPadesCms } from "../../src/lib/sign/pades.js";
import { getActiveSigner } from "../../src/lib/sign/types.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 30,
};

type SignManifestRequest = {
  /** Canonical-JSON-encoded manifest bytes, base64-encoded. The pack
   *  builder is responsible for canonicalising — we sign exactly the
   *  bytes we are handed, byte-for-byte, so the verifier can recompute
   *  the same hash. */
  manifest_b64?: unknown;
  draftId?: unknown;
};

type SignManifestResponse = {
  /** DER-encoded CMS SignedData, base64. Write this to manifest.sig. */
  cms_b64: string;
  /** Raw 32-byte Ed25519 public key, base64. For verifiers that don't yet
   *  have access to the signer registry. */
  public_key_b64: string;
  /** Stable identifier — KMS key ARN/alias for the KMS signer, a
   *  fingerprint for the local signer. */
  key_id: string;
  algorithm: "Ed25519";
  /** SHA-256 hex of the manifest bytes — also recorded in the CMS
   *  message-digest signed attribute. */
  content_sha256: string;
  /** ISO8601 UTC. Either the TSA-signed time (when FreeTSA was reachable)
   *  or the local signing-time signed attr (when it wasn't). */
  signed_at: string | null;
  /** "freetsa" | null. null means the TSR fetch failed; the CMS is then
   *  PAdES-B-B and the export is downgraded from B-T to B-B. */
  tsa: string | null;
};

const MAX_MANIFEST_BYTES = 200_000;

export async function POST(req: Request): Promise<Response> {
  const originError = enforceSameOrigin(req);
  if (originError) return originError;
  const rateLimitError = rateLimit(req, { name: "sign-manifest", max: 30, windowMs: 60_000 });
  if (rateLimitError) return rateLimitError;

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);
  const tenantId = auth.activeTenant.id;
  const actorUserId = auth.userRow.id;

  const parsed = await readJsonRequest<SignManifestRequest>(req, MAX_MANIFEST_BYTES * 2);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  if (typeof body.manifest_b64 !== "string" || body.manifest_b64.length === 0) {
    return jsonError("manifest_b64 required", 400);
  }
  if (typeof body.draftId !== "string" || body.draftId.length === 0) {
    return jsonError("draftId required", 400);
  }

  let manifestBytes: Buffer;
  try {
    manifestBytes = Buffer.from(body.manifest_b64, "base64");
  } catch {
    return jsonError("manifest_b64 must be valid base64", 400);
  }
  if (manifestBytes.byteLength === 0) {
    return jsonError("manifest_b64 decoded to 0 bytes", 400);
  }
  if (manifestBytes.byteLength > MAX_MANIFEST_BYTES) {
    return jsonError(`manifest too large (>${MAX_MANIFEST_BYTES} bytes)`, 413);
  }

  if (!isUuid(body.draftId)) {
    return jsonError("draftId must be a UUID", 400);
  }

  const owns = await draftBelongsToTenant(body.draftId, tenantId);
  if (!owns) {
    return jsonError("draft not found in active tenant", 404);
  }

  // ---- KMS / local signer + RFC 3161 timestamp -------------------------
  //
  // Both runs concurrently to hide the FreeTSA latency behind the KMS
  // round-trip. If KMS itself fails we surface the error — no silent
  // fallback to the local signer when SIGNING_KMS_KEY_ID was set, per
  // SUNDAY.md Section C.
  let signerName: "kms" | "local";
  let publicKey: Uint8Array;
  let cmsDer: Uint8Array;
  let contentSha256: string;
  let signedAtIso: string | null = null;
  let tsa: string | null = null;
  let tsrParseError: string | null = null;

  try {
    const signer = await getActiveSigner();
    signerName = signer.keyId.startsWith("local:") ? "local" : "kms";

    const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
    const [pk, tsr] = await Promise.all([
      signer.publicKey(),
      requestTsr(manifestSha256).catch(() => null),
    ]);
    publicKey = pk;

    const built = await buildPadesCms({
      content: manifestBytes,
      signer,
      tsr: tsr ?? undefined,
    });
    cmsDer = built.cmsDer;
    contentSha256 = built.contentSha256Hex;

    if (tsr) {
      const parsedTsr = parseTsr(tsr);
      if (parsedTsr.ok) {
        signedAtIso = parsedTsr.signedAtUtc.toISOString();
        tsa = parsedTsr.tsaName;
      } else {
        tsrParseError = parsedTsr.reason;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(`signing failed: ${message}`, 500);
  }

  // ---- Audit ------------------------------------------------------------
  //
  // Best-effort: never block a successful signature on the audit write,
  // but log loudly if it fails.
  await tryAppendSigningAudit({
    tenantId,
    draftId: body.draftId,
    actorUserId,
    signerName,
    contentSha256,
    signedAtIso,
    tsa,
    tsrParseError,
  }).catch((err) => {
    console.error("[audit] sign-manifest append failed", err);
  });

  const response: SignManifestResponse = {
    cms_b64: Buffer.from(cmsDer).toString("base64"),
    public_key_b64: Buffer.from(publicKey).toString("base64"),
    key_id: signerName === "kms"
      ? (process.env.SIGNING_KMS_KEY_ID ?? "(unknown)")
      : `local:ed25519:${createHash("sha256").update(publicKey).digest("hex").slice(0, 16)}`,
    algorithm: "Ed25519",
    content_sha256: contentSha256,
    signed_at: signedAtIso,
    tsa,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

type AuditInput = {
  tenantId: string;
  draftId: string;
  actorUserId: string;
  signerName: "kms" | "local";
  contentSha256: string;
  signedAtIso: string | null;
  tsa: string | null;
  tsrParseError: string | null;
};

async function tryAppendSigningAudit(input: AuditInput): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  await appendAuditEvent({
    tenantId: input.tenantId,
    kind: input.signerName === "kms" ? "draft.signed_with_kms" : "draft.signed_local",
    subjectType: "draft",
    subjectId: input.draftId,
    actorUserId: input.actorUserId,
    payload: {
      algorithm: "Ed25519",
      sha256: input.contentSha256,
      signed_at: input.signedAtIso,
      tsa: input.tsa,
      tsa_status: input.tsa ? "granted" : input.tsrParseError ? "invalid" : "unavailable",
      tsa_reason: input.tsrParseError,
    },
  });
}

async function draftBelongsToTenant(draftId: string, tenantId: string): Promise<boolean> {
  const db = getDb();
  const [draft] = await db
    .select({ id: drafts.id })
    .from(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)))
    .limit(1);
  return Boolean(draft);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
