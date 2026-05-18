/**
 * Verify a signed export.
 *
 * Two acceptance shapes:
 *
 *  1. NEW (PAdES-B-T-style): caller hands us a CMS SignedData blob (the
 *     contents of `manifest.sig`) plus the expected content bytes
 *     (`manifest.json`). We parse the CMS, verify the Ed25519 signature
 *     against the supplied public key, recompute SHA-256(content) and
 *     match it against the message-digest signed attr, then verify the
 *     embedded RFC 3161 TimeStampToken via the existing parseTsr helper.
 *
 *  2. LEGACY: caller hands us a raw TSR base64 plus the expected SHA-256.
 *     This is what historical exports recorded (header-side TSR + audit
 *     event). Verifier returns `{ ok: true, legacy: true, ... }` so the
 *     audit endpoint can keep validating pre-PAdES letters without a
 *     breaking flag day.
 *
 * The verifier returns a structured result; callers (the verify-tsr API
 * route, the export integrity check) decide whether to surface it to the
 * end user or just log it.
 */
import { createHash, verify as nodeVerify, createPublicKey } from "node:crypto";

import { parsePadesCms, type ParsedPadesCms } from "./pades.js";

// Re-imported here (rather than via api/_utils/tsa.js) to keep this module
// inside src/lib/sign — it can be exercised from both sides without
// dragging Vercel api/ paths into the dependency graph.
import { parseTsr } from "../../../api/_utils/tsa.js";

export type VerifyOk = {
  ok: true;
  legacy?: false;
  signedAt: Date | null;
  signedBy: string;
  publicKeyFingerprint: string;
  contentSha256Hex: string;
  /** "freetsa" today; future TSAs annotated by parseTsr. */
  tsa: string | null;
};

export type VerifyLegacyOk = {
  ok: true;
  legacy: true;
  signedAt: Date | null;
  contentSha256Hex: string;
  tsa: string | null;
};

export type VerifyFail = {
  ok: false;
  reason:
    | "no_signature"
    | "cms_parse_failed"
    | "unsupported_signature_algorithm"
    | "message_digest_mismatch"
    | "signature_mismatch"
    | "byte_range_tampered"
    | "tsa_missing"
    | "tsa_invalid"
    | "wrong_public_key";
  detail?: string;
};

export type VerifyResult = VerifyOk | VerifyLegacyOk | VerifyFail;

export type VerifyNewInput = {
  /** DER bytes of the CMS SignedData (`manifest.sig`). */
  cms: Uint8Array;
  /** Expected content bytes (`manifest.json`). */
  expectedContent: Uint8Array;
  /** Raw 32-byte Ed25519 public key for the signing key. The verifier
   *  re-checks the signature against this key — if a different key was
   *  used we return wrong_public_key. */
  expectedPublicKey: Uint8Array;
  /** Override the TSA cert pin set (default: FreeTSA's pinned key hashes).
   *  Tests use this to swap in their synthetic TSA. */
  tsaTrustPins?: readonly string[];
  /** Human label for the trusted TSA. Defaults to "FreeTSA". */
  tsaName?: string;
};

export async function verifyPadesCms(input: VerifyNewInput): Promise<VerifyResult> {
  let parsed: ParsedPadesCms;
  try {
    parsed = parsePadesCms(input.cms);
  } catch (err) {
    return { ok: false, reason: "cms_parse_failed", detail: (err as Error).message };
  }

  // Algorithm whitelist — only Ed25519. (We deliberately don't accept
  // RSA / ECDSA SignedData here; the writer never produces them.)
  if (parsed.signatureAlgorithm !== "1.3.101.112") {
    return {
      ok: false,
      reason: "unsupported_signature_algorithm",
      detail: parsed.signatureAlgorithm,
    };
  }

  // Content integrity: SHA-256(expectedContent) must equal both
  //  - SHA-256(parsed.content)  (CMS carries the right content)
  //  - parsed.messageDigest     (message-digest signed attribute matches)
  const expectedDigest = createHash("sha256").update(input.expectedContent).digest();
  const cmsContentDigest = createHash("sha256").update(parsed.content).digest();
  if (!buffersEqual(expectedDigest, cmsContentDigest)) {
    return { ok: false, reason: "byte_range_tampered" };
  }
  if (!buffersEqual(expectedDigest, parsed.messageDigest)) {
    return { ok: false, reason: "message_digest_mismatch" };
  }

  // Ed25519 verify — node:crypto needs a SPKI/PEM public key. Build a SPKI
  // wrapper around the raw 32-byte key (RFC 8410 §4).
  let publicKey: ReturnType<typeof createPublicKey>;
  try {
    publicKey = ed25519PublicKeyFromRaw(input.expectedPublicKey);
  } catch (err) {
    return { ok: false, reason: "wrong_public_key", detail: (err as Error).message };
  }

  const sigOk = nodeVerify(
    null,
    Buffer.from(parsed.signedAttrsDer),
    publicKey,
    Buffer.from(parsed.signature),
  );
  if (!sigOk) return { ok: false, reason: "signature_mismatch" };

  // RFC 3161 timestamp — required for PAdES-B-T. parseTsr does the heavy
  // lifting: TSA cert chain pinning, signature over TSTInfo, hash
  // algorithm whitelist.
  let signedAt: Date | null = parsed.signingTime;
  let tsa: string | null = null;
  if (parsed.timestampToken) {
    // The TimeStampToken in the unsigned attr is a bare ContentInfo;
    // wrap it back into a TimeStampResp so parseTsr accepts it. parseTsr
    // actually accepts a TimeStampResp shape — for a bare token we
    // synthesise the granted-status wrapper.
    const tsrLike = wrapAsGrantedTimeStampResp(parsed.timestampToken);
    const tsrResult = parseTsr(tsrLike, {
      trustedTsaKeyPins: input.tsaTrustPins,
      tsaName: input.tsaName,
    });
    if (!tsrResult.ok) {
      return { ok: false, reason: "tsa_invalid", detail: tsrResult.reason };
    }
    signedAt = tsrResult.signedAtUtc;
    tsa = tsrResult.tsaName;
  } else {
    return { ok: false, reason: "tsa_missing" };
  }

  return {
    ok: true,
    legacy: false,
    signedAt,
    signedBy: parsed.keyId,
    publicKeyFingerprint: fingerprintRawKey(input.expectedPublicKey),
    contentSha256Hex: cmsContentDigest.toString("hex"),
    tsa,
  };
}

export type VerifyLegacyInput = {
  tsr: Uint8Array;
  expectedSha256Hex: string;
  /** Override the TSA cert pin set. Production callers leave this unset to
   *  use the FreeTSA pins from api/_utils/tsa.ts. */
  tsaTrustPins?: readonly string[];
  tsaName?: string;
};

/**
 * Legacy verifier: just a TSR + the expected hash. Mirrors the old
 * /api/audit/verify-tsr behaviour but returns a structured VerifyResult so
 * the new and legacy paths can share an interface in calling code.
 */
export function verifyLegacy(input: VerifyLegacyInput): VerifyResult {
  const tsrResult = parseTsr(Buffer.from(input.tsr), {
    trustedTsaKeyPins: input.tsaTrustPins,
    tsaName: input.tsaName,
  });
  if (!tsrResult.ok) {
    return { ok: false, reason: "tsa_invalid", detail: tsrResult.reason };
  }
  if (tsrResult.sha256Hex.toLowerCase() !== input.expectedSha256Hex.toLowerCase()) {
    return { ok: false, reason: "byte_range_tampered" };
  }
  return {
    ok: true,
    legacy: true,
    signedAt: tsrResult.signedAtUtc,
    contentSha256Hex: tsrResult.sha256Hex,
    tsa: tsrResult.tsaName,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buffersEqual(a: Uint8Array | Buffer, b: Uint8Array | Buffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// RFC 8410 §4: SubjectPublicKeyInfo for Ed25519 is a 12-byte prefix +
// 32-byte raw key.
const ED25519_SPKI_PREFIX = Uint8Array.from([
  0x30, 0x2a, // SEQUENCE (42 bytes)
  0x30, 0x05, // SEQUENCE (5 bytes) — AlgorithmIdentifier
  0x06, 0x03, 0x2b, 0x65, 0x70, // OID 1.3.101.112 = ed25519
  0x03, 0x21, 0x00, // BIT STRING (33 bytes incl. unused-bits prefix = 0)
]);

function ed25519PublicKeyFromRaw(raw: Uint8Array): ReturnType<typeof createPublicKey> {
  if (raw.byteLength !== 32) {
    throw new Error(`Ed25519 public key must be 32 bytes, got ${raw.byteLength}`);
  }
  const spki = new Uint8Array(ED25519_SPKI_PREFIX.length + raw.length);
  spki.set(ED25519_SPKI_PREFIX, 0);
  spki.set(raw, ED25519_SPKI_PREFIX.length);
  return createPublicKey({ key: Buffer.from(spki), format: "der", type: "spki" });
}

function fingerprintRawKey(raw: Uint8Array): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

/**
 * Wrap a bare TimeStampToken (ContentInfo) inside a granted TimeStampResp
 * so the existing parseTsr helper — which expects the wrapping response —
 * can validate it.
 *
 * TimeStampResp ::= SEQUENCE {
 *   status     PKIStatusInfo,   -- granted = status 0
 *   timeStampToken ContentInfo OPTIONAL
 * }
 * PKIStatusInfo for status 0: SEQUENCE { INTEGER(0) } encodes as
 *   30 03 02 01 00
 */
function wrapAsGrantedTimeStampResp(tokenDer: Uint8Array): Buffer {
  const status = Uint8Array.from([0x30, 0x03, 0x02, 0x01, 0x00]);
  const inner = new Uint8Array(status.length + tokenDer.length);
  inner.set(status, 0);
  inner.set(tokenDer, status.length);

  // Wrap inner in SEQUENCE with proper length encoding.
  const lengthBytes = encodeLength(inner.length);
  const out = new Uint8Array(1 + lengthBytes.length + inner.length);
  out[0] = 0x30;
  out.set(lengthBytes, 1);
  out.set(inner, 1 + lengthBytes.length);
  return Buffer.from(out);
}

function encodeLength(len: number): Uint8Array {
  if (len < 0x80) return Uint8Array.from([len]);
  const bytes: number[] = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Uint8Array.from([0x80 | bytes.length, ...bytes]);
}
