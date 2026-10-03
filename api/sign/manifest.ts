/** Sign the exact canonical pack manifest for an authenticated saved draft.
 * A CMS sidecar is not an embedded PDF signature, legal review or trusted time.
 * Unconfigured signing is explicit. Configured signer failures fail the export.
 */
import { createHash } from "node:crypto";
import { eq, and, isNull } from "drizzle-orm";
import { rateLimit } from "../_utils/rate-limit.js";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../_utils/request.js";
import { requireSessionAndTenant } from "../_utils/session-with-tenant.js";
import { appendAuditEvent } from "../../src/db/audit.js";
import { getDb } from "../../src/db/index.js";
import { drafts } from "../../src/db/schema.js";
import { buildPadesCms } from "../../src/lib/sign/pades.js";
import { getActiveSigner } from "../../src/lib/sign/types.js";
import { verifyPadesCms } from "../../src/lib/sign/verify.js";
import { withSessionResponse } from "../_utils/workos.js";
import {
  decodeBase64, MAX_MANIFEST_BYTES, parsePackManifest, type PackSigningResponse,
} from "../../src/lib/export/pack-integrity.js";
import { serverUuidOrNull } from "../../src/lib/remote-ids.js";

export const config = { runtime: "nodejs", maxDuration: 30 };

export async function POST(req: Request): Promise<Response> {
  return withSessionResponse(req, handlePost);
}

const json = (body: PackSigningResponse) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});

async function handlePost(req: Request): Promise<Response> {
  const originError = enforceSameOrigin(req);
  if (originError) return originError;
  const rateLimitError = await rateLimit(req, { name: "sign-manifest", max: 30, windowMs: 60_000 });
  if (rateLimitError) return rateLimitError;
  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant || !auth.activeMember || serverUuidOrNull(req.headers.get("X-Workspace-ID")) !== auth.activeTenant.id) {
    return jsonError("The active workspace changed. Reload before signing.", 409);
  }
  if (!["owner", "admin", "drafter", "reviewer"].includes(auth.activeMember.role)) {
    return jsonError("This workspace role is read-only", 403);
  }
  const tenantId = auth.activeTenant.id;
  const parsed = await readJsonRequest<{ manifest_b64?: unknown; draftId?: unknown }>(req, MAX_MANIFEST_BYTES * 2);
  if (!parsed.ok) return parsed.response;
  if (!parsed.body || typeof parsed.body.manifest_b64 !== "string" || !serverUuidOrNull(parsed.body.draftId as string)) {
    return jsonError("A draft ID and base64 manifest are required", 400);
  }
  let manifestBytes: Uint8Array;
  let manifest: ReturnType<typeof parsePackManifest>;
  try {
    manifestBytes = decodeBase64(parsed.body.manifest_b64);
    manifest = parsePackManifest(manifestBytes);
  } catch {
    return jsonError("Invalid canonical export-pack manifest", 400);
  }
  if (manifest.draftId !== parsed.body.draftId || manifest.workspaceId !== tenantId || !manifest.draftRevision) {
    return jsonError("Manifest does not match the active workspace and draft", 409);
  }

  try {
    const [draft] = await getDb().select({ revision: drafts.revision }).from(drafts)
      .where(and(eq(drafts.id, manifest.draftId), eq(drafts.tenantId, tenantId), isNull(drafts.deletedAt))).limit(1);
    if (!draft) return jsonError("Draft not found in the active workspace", 404);
    if (draft.revision !== manifest.draftRevision) return jsonError("This draft changed. Reload and export the saved version again.", 409);

    // No ephemeral/dev key is ever substituted for a production signing key.
    // This response is the ONLY condition under which the client emits an
    // unsigned workspace pack. Missing auth, 404s and outages are not opt-outs.
    if (!process.env.SIGNING_KMS_KEY_ID?.trim()) return json({ status: "unsigned", reason: "not_configured" });

    const signer = await getActiveSigner();
    const publicKey = await signer.publicKey();
    const signingTime = new Date();
    const built = await buildPadesCms({ content: manifestBytes, signer, signingTime });
    const verified = await verifyPadesCms({
      cms: built.cmsDer, expectedContent: manifestBytes, expectedPublicKey: publicKey, requireTimestamp: false,
    });
    if (!verified.ok) throw new Error(`Signer produced an unverifiable manifest: ${verified.reason}`);

    // A signing record must be durable before reporting success. A later retry
    // may create another signature; it can never report an unsigned success.
    await appendAuditEvent({
      tenantId, kind: "draft.signed_with_kms", subjectType: "draft", subjectId: manifest.draftId,
      actorUserId: auth.userRow.id,
      payload: { algorithm: "Ed25519", sha256: built.contentSha256Hex, draftRevision: manifest.draftRevision,
        keyId: signer.keyId, publicKeySha256: createHash("sha256").update(publicKey).digest("hex"),
        signed_at: signingTime.toISOString(), timestamp: "none" },
    });
    return json({
      status: "signed", cms_b64: Buffer.from(built.cmsDer).toString("base64"),
      public_key_b64: Buffer.from(publicKey).toString("base64"),
      public_key_sha256: createHash("sha256").update(publicKey).digest("hex"),
      key_id: signer.keyId, algorithm: "Ed25519", content_sha256: built.contentSha256Hex,
      signed_at: signingTime.toISOString(), timestamp: "none",
    });
  } catch (error) {
    console.error("[sign-manifest] signing or audit persistence failed", error instanceof Error ? error.name : "UnknownError");
    return jsonError("Pack signing is temporarily unavailable. No signed pack has been confirmed; please retry.", 503);
  }
}
