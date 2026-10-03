import { z } from "zod";
import { canonicalJson } from "../../db/canonical-json.js";

export const PACK_FORMAT = "drafthr-export-pack/v1";
export const MAX_MANIFEST_BYTES = 200_000;
export const PACK_CONTROL_FILES = ["manifest.json", "manifest.sig", "signature.json"] as const;

// These names must remain safe on Windows and Unix, including after extraction.
export function isSafePackPath(path: string): boolean {
  return path.length <= 240 && !/[\\\x00-\x1f\x7f:<>"|?*]/.test(path) &&
    path.split("/").every(part => Boolean(part) && part !== "." && part !== ".." &&
      !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}

const fileSchema = z.object({
  path: z.string().refine(isSafePackPath, "Unsafe artifact path"),
  bytes: z.number().int().nonnegative().max(100 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const packManifestSchema = z.object({
  format: z.literal(PACK_FORMAT),
  hashAlgorithm: z.literal("SHA-256"),
  draftId: z.string().uuid(),
  workspaceId: z.string().uuid().nullable(),
  draftRevision: z.number().int().positive().nullable(),
  generatedAt: z.string().datetime(),
  metadata: z.record(z.unknown()),
  files: z.array(fileSchema).min(1).max(512),
}).strict().superRefine((manifest, ctx) => {
  const paths = manifest.files.map(file => file.path);
  const folded = new Set(paths.map(path => path.toLowerCase()));
  const controls = new Set<string>(PACK_CONTROL_FILES);
  if (paths.some(path => controls.has(path.toLowerCase()) || path.split("/").slice(0, -1).some((_part, i, parts) => {
    const parent = parts.slice(0, i + 1).join("/").toLowerCase();
    return folded.has(parent) || controls.has(parent);
  })) || folded.size !== paths.length ||
      paths.some((path, index) => index > 0 && paths[index - 1] >= path)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Artifact paths must be unique, sorted and exclude control files" });
  }
  if ((manifest.workspaceId === null) !== (manifest.draftRevision === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Workspace and revision must be present together" });
  }
});

export type PackManifest = z.infer<typeof packManifestSchema>;
export type PackIntegrityOutcome =
  | { status: "signed"; keyId: string; publicKeyFingerprint: string; timestamp: "none" }
  | { status: "unsigned"; reason: "not_configured" | "local_only" };

export type PackSigningResponse =
  | { status: "unsigned"; reason: "not_configured" }
  | {
    status: "signed";
    cms_b64: string;
    public_key_b64: string;
    public_key_sha256: string;
    key_id: string;
    algorithm: "Ed25519";
    content_sha256: string;
    signed_at: string;
    timestamp: "none";
  };

const signingResponseSchema = z.union([
  z.object({ status: z.literal("unsigned"), reason: z.literal("not_configured") }).strict(),
  z.object({ status: z.literal("signed"), cms_b64: z.string(), public_key_b64: z.string(),
    public_key_sha256: z.string().regex(/^[a-f0-9]{64}$/), key_id: z.string().min(1),
    algorithm: z.literal("Ed25519"), content_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    signed_at: z.string().datetime(), timestamp: z.literal("none") }).strict(),
]);

export function encodePackManifest(manifest: PackManifest): Uint8Array {
  const bytes = Uint8Array.from(new TextEncoder().encode(canonicalJson(packManifestSchema.parse(manifest))));
  if (bytes.byteLength > MAX_MANIFEST_BYTES) throw new Error("The export manifest is too large.");
  return bytes;
}

export function parsePackManifest(bytes: Uint8Array): PackManifest {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_MANIFEST_BYTES) throw new Error("Invalid manifest size");
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  const manifest = packManifestSchema.parse(JSON.parse(text));
  // Sign the exact UTF-8 canonical representation, rejecting whitespace,
  // duplicate keys, reordered keys and non-canonical encodings.
  if (canonicalJson(manifest) !== text) throw new Error("Manifest must use canonical JSON");
  return manifest;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeBase64(value: string): Uint8Array {
  if (!value || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("Invalid base64 data");
  }
  const bytes = Uint8Array.from(atob(value), char => char.charCodeAt(0));
  if (encodeBase64(bytes) !== value) throw new Error("Invalid base64 data");
  return bytes;
}

/** No transport/auth/provider error is interpreted as 'signing disabled'. */
export async function requestPackSignature(
  manifest: PackManifest,
  manifestBytes: Uint8Array,
  isCurrent: () => boolean,
): Promise<PackSigningResponse> {
  if (!manifest.workspaceId || !manifest.draftRevision) throw new Error("Save the draft before signing its pack.");
  const assertCurrent = () => {
    if (!isCurrent()) throw new Error("Workspace changed. Export again from the original workspace.");
  };
  assertCurrent();
  const response = await fetch("/api/sign/manifest", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Workspace-ID": manifest.workspaceId },
    body: JSON.stringify({ draftId: manifest.draftId, manifest_b64: encodeBase64(manifestBytes) }),
  });
  assertCurrent();
  const raw: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = raw && typeof raw === "object" && "error" in raw && typeof raw.error === "string" ? raw.error : null;
    throw new Error(detail ?? `Pack signing failed (${response.status}). Please retry.`);
  }
  const parsed = signingResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("The signing service returned an invalid response. The pack has not been saved.");
  }
  const body = parsed.data;
  if (body.status === "unsigned") return body;
  const publicKey = decodeBase64(body.public_key_b64);
  const cms = decodeBase64(body.cms_b64);
  if (publicKey.byteLength !== 32 || cms.byteLength < 64 || cms.byteLength > MAX_MANIFEST_BYTES + 20_000 ||
      body.content_sha256 !== await sha256Hex(manifestBytes) || body.public_key_sha256 !== await sha256Hex(publicKey)) {
    throw new Error("The signature does not match this export. The pack has not been saved.");
  }
  assertCurrent();
  return body as PackSigningResponse;
}

export const PACK_VERIFICATION_INSTRUCTIONS = `INTEGRITY AND SIGNATURE VERIFICATION
------------------------------------
manifest.json is UTF-8 JSON with recursively sorted object keys, no whitespace
and no trailing newline. Its files array is sorted by path. Each entry records
the exact uncompressed byte count and SHA-256 of a payload file, including this
README. The three control files (manifest.json, signature.json, manifest.sig)
are not self-hashed. Reject missing, changed or additional payload files.

signature.json explicitly says signed or unsigned. An unsigned pack provides
checksums only: anyone able to replace the files can replace the manifest too.
Removing a signature must NEVER be treated as a verified signed export.

A signed pack also contains manifest.sig (DER CMS SignedData with Ed25519),
which covers the exact manifest bytes. The included public key is informational,
NOT a trust anchor. Independently obtain the expected 32-byte Ed25519 public key
and its full SHA-256 fingerprint from your workspace administrator through a
trusted channel, and compare it before verification. Retain historical trusted
keys when keys rotate. A key bundled with the pack alone cannot prove origin.

Use a trusted copy of DraftHR's verifier (do not run programs from an untrusted
attachment). In an installed DraftHR source checkout, run:
  node --import tsx src/lib/export/verify-pack-cli.ts /path/to/pack.zip /path/to/trusted-key.b64
The trusted-key file contains the base64-encoded raw 32-byte public key, not PEM.
For checksums only, explicitly use --allow-unsigned instead of a key file.
The verifier performs no network calls and does not extract files to disk.

The signature establishes integrity under the independently trusted key. It
does not verify the truth of the document, counsel review, legal admissibility,
or who personally authored it. This format has no independently trusted time
stamp, no certificate chain and no embedded PDF signature. It is not PAdES or
regulatory WORM storage. Generated/signing times are claimed application times.
`;
