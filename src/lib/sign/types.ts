/**
 * Shared signer interface — both the AWS KMS-backed signer (kms-signer.ts)
 * and the in-process dev-fallback signer (local-signer.ts) satisfy this.
 *
 * The export path (api/sign/manifest.ts) and the CMS builder (pades.ts)
 * depend only on this interface so the rest of the code never has to care
 * which signer is active.
 *
 * Ed25519 is the only algorithm we sign with today. AWS KMS exposes this as
 * KeySpec=ECC_NIST_EDWARDS25519 + SigningAlgorithm=ED25519_SHA_512, which is
 * pure EdDSA (the hash is part of the EdDSA construction — there is no
 * separate digest step on the caller side). The "_SHA_512" suffix in the AWS
 * spec name refers to the digest *inside* the EdDSA primitive (RFC 8032),
 * not a pre-hash. We always pass MessageType=RAW.
 *
 * Source: https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html
 * (SigningAlgorithm valid values include ED25519_SHA_512).
 */

export type SignerAlgorithm = "Ed25519";

export interface KmsSigner {
  /** Stable identifier for the signing key — KMS ARN/alias for KMS, a key
   *  fingerprint for the local signer. Recorded in CMS as the `serialNumber`
   *  field of IssuerAndSerialNumber so verifiers can match the signature to
   *  the public key. */
  readonly keyId: string;

  /** EdDSA. Distinct from the AWS SigningAlgorithmSpec name. */
  readonly algorithm: SignerAlgorithm;

  /** Raw 32-byte Ed25519 public key (no SPKI/DER wrapper). The KMS path
   *  calls GetPublicKey and unwraps the SubjectPublicKeyInfo; the local
   *  path just returns its in-process key. Cached for the signer lifetime. */
  publicKey(): Promise<Uint8Array>;

  /** Sign a raw message (Ed25519 is RFC 8032 PureEdDSA: no pre-hash). For
   *  KMS we pass MessageType: "RAW". Returns the 64-byte signature. */
  sign(message: Uint8Array): Promise<Uint8Array>;
}

/**
 * Pick the right signer for the current environment.
 *
 * - In production (when SIGNING_KMS_KEY_ID is set), return the KMS-backed
 *   signer. Errors at sign time MUST propagate — we never silently fall back
 *   to the local signer when KMS is configured but unavailable; that would
 *   defeat the security guarantee.
 * - In dev/test (no SIGNING_KMS_KEY_ID), return the local Ed25519 signer
 *   keyed off DRAFTHR_SIGNING_KEY_HEX (32-byte seed, hex-encoded). If that
 *   env var is also absent the local signer mints an ephemeral key —
 *   acceptable for tests, never for real exports.
 *
 * This is a lazy import to keep the @aws-sdk/client-kms bundle out of the
 * dev path entirely. The first call in production pays the import cost once;
 * subsequent calls reuse the cached signer.
 */
export type SignerEnv = {
  SIGNING_KMS_KEY_ID?: string;
  AWS_REGION?: string;
  DRAFTHR_SIGNING_KEY_HEX?: string;
};

let cachedSigner: KmsSigner | null = null;

export async function getActiveSigner(
  envOverride?: SignerEnv,
): Promise<KmsSigner> {
  if (cachedSigner) return cachedSigner;
  const env: SignerEnv = envOverride ?? (process.env as SignerEnv);

  if (env.SIGNING_KMS_KEY_ID && env.SIGNING_KMS_KEY_ID.trim().length > 0) {
    const { createKmsSigner } = await import("./kms-signer.js");
    cachedSigner = await createKmsSigner({
      keyId: env.SIGNING_KMS_KEY_ID,
      region: env.AWS_REGION ?? "eu-west-2",
      credentialsFromEnv: true,
    });
    return cachedSigner;
  }

  const { createLocalSigner } = await import("./local-signer.js");
  cachedSigner = createLocalSigner({ keyHex: env.DRAFTHR_SIGNING_KEY_HEX });
  return cachedSigner;
}

/** Test-only: drop the cached signer so the next getActiveSigner() picks up
 *  whatever the test has just set in process.env / envOverride. Not exported
 *  from a barrel — callers import explicitly. */
export function _resetSignerCacheForTests(): void {
  cachedSigner = null;
}
