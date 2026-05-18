/**
 * AWS KMS-backed Ed25519 signer.
 *
 * The private key never leaves KMS. Every export-time signature is a network
 * round-trip to kms.Sign — slow (~50-200ms) but auditable: KMS logs every
 * call in CloudTrail, the IAM principal that triggered it is recorded, and
 * the key material is FIPS 140-2 Level 3 HSM-backed.
 *
 * Algorithm choice: ED25519_SHA_512 over MessageType=RAW. Per AWS KMS docs,
 * this corresponds to NIST FIPS 186-5 Section 7.6 EdDSA (RFC 8032 PureEdDSA).
 * The "_SHA_512" suffix names the digest *inside* the EdDSA primitive, not a
 * caller-side pre-hash — we pass the raw message and KMS runs the full EdDSA.
 *
 * Source:
 *   https://docs.aws.amazon.com/kms/latest/developerguide/asymmetric-key-specs.html
 *   https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html
 *
 * Note: @aws-sdk/client-kms is dynamically imported so dev/CI without the
 * package installed (and the browser bundle, which never reaches this file
 * at runtime) don't pay the ~3MB SDK cost. The package must be installed in
 * production — see docs/signing.md for provisioning.
 */
import type { KmsSigner } from "./types.js";

export type CreateKmsSignerOptions = {
  /** Key ARN, alias name (alias/foo), or alias ARN. KMS resolves all three. */
  keyId: string;
  /** AWS region — must match the region the KMS key lives in. */
  region: string;
  /** When true (default), the SDK reads credentials from the standard
   *  env vars / IAM role chain. Set false to bring your own `credentials`
   *  via the future opts.credentials field. */
  credentialsFromEnv?: boolean;
};

// Structural shape of the bits of @aws-sdk/client-kms we touch. This avoids
// a hard dependency for `tsc --noEmit` when the package isn't installed
// locally — the runtime dynamic import still requires it.
type KmsClientLike = {
  send: (command: unknown) => Promise<unknown>;
};

type KmsSdkModuleLike = {
  KMSClient: new (config: { region: string }) => KmsClientLike;
  GetPublicKeyCommand: new (input: { KeyId: string }) => unknown;
  SignCommand: new (input: {
    KeyId: string;
    Message: Uint8Array;
    MessageType: "RAW" | "DIGEST";
    SigningAlgorithm: "ED25519_SHA_512";
  }) => unknown;
};

type GetPublicKeyResult = {
  KeyId?: string;
  PublicKey?: Uint8Array;
  KeySpec?: string;
  KeyUsage?: string;
};

type SignResult = {
  KeyId?: string;
  Signature?: Uint8Array;
  SigningAlgorithm?: string;
};

export async function createKmsSigner(
  opts: CreateKmsSignerOptions,
): Promise<KmsSigner> {
  // Dynamic import keeps the ~3MB AWS SDK off the dev/test code path. When
  // SIGNING_KMS_KEY_ID is set we require @aws-sdk/client-kms to be
  // installed; it's declared in package.json under optionalDependencies so
  // the dev install path keeps working when AWS isn't configured.
  //
  // The /* @vite-ignore */ hint defuses Vite's static import-analysis pass
  // (which otherwise hard-fails the dev/test bundle when the dep is
  // missing). Tests vi.doMock() the specifier to inject a fake SDK.
  const specifier = "@aws-sdk/client-kms";
  const sdk = (await import(/* @vite-ignore */ specifier)) as unknown as KmsSdkModuleLike;
  const client = new sdk.KMSClient({ region: opts.region });

  // Cached on first call. We expect the public key to be stable for the
  // lifetime of the signer instance — KMS does not rotate the key material
  // of an existing asymmetric KMS key without operator action.
  let cachedPublic: Uint8Array | null = null;

  async function publicKey(): Promise<Uint8Array> {
    if (cachedPublic) return cachedPublic;
    let result: GetPublicKeyResult;
    try {
      result = (await client.send(
        new sdk.GetPublicKeyCommand({ KeyId: opts.keyId }),
      )) as GetPublicKeyResult;
    } catch (err) {
      throw new Error(
        `KMS GetPublicKey failed for ${opts.keyId}: ${formatAwsError(err)}`,
      );
    }

    if (result.KeySpec && result.KeySpec !== "ECC_NIST_EDWARDS25519") {
      throw new Error(
        `KMS key ${opts.keyId} has KeySpec=${result.KeySpec}; ` +
          `expected ECC_NIST_EDWARDS25519 (Ed25519)`,
      );
    }
    if (result.KeyUsage && result.KeyUsage !== "SIGN_VERIFY") {
      throw new Error(
        `KMS key ${opts.keyId} has KeyUsage=${result.KeyUsage}; expected SIGN_VERIFY`,
      );
    }
    if (!result.PublicKey || result.PublicKey.byteLength === 0) {
      throw new Error(`KMS GetPublicKey for ${opts.keyId} returned empty PublicKey`);
    }

    // KMS returns the public key DER-encoded as a SubjectPublicKeyInfo
    // (RFC 5280 §4.1). For Ed25519 SPKI the raw 32-byte key is always the
    // trailing 32 bytes; we strip the AlgorithmIdentifier + BIT STRING
    // header. This matches what RFC 8410 specifies for Ed25519 SPKI.
    const spki = result.PublicKey;
    if (spki.byteLength < 32) {
      throw new Error(`KMS PublicKey too short: ${spki.byteLength} bytes`);
    }
    cachedPublic = spki.slice(spki.byteLength - 32);
    return cachedPublic;
  }

  async function sign(message: Uint8Array): Promise<Uint8Array> {
    if (message.byteLength === 0) {
      throw new Error("KMS Sign requires non-empty Message");
    }
    if (message.byteLength > 4096) {
      // KMS Sign cap per API reference. Callers must pre-digest larger
      // payloads; for manifest.sig the canonical JSON is well under 4KB.
      throw new Error(
        `KMS Sign Message too large: ${message.byteLength} bytes (max 4096)`,
      );
    }

    let result: SignResult;
    try {
      result = (await client.send(
        new sdk.SignCommand({
          KeyId: opts.keyId,
          Message: message,
          MessageType: "RAW",
          SigningAlgorithm: "ED25519_SHA_512",
        }),
      )) as SignResult;
    } catch (err) {
      throw new Error(
        `KMS Sign failed for ${opts.keyId}: ${formatAwsError(err)}`,
      );
    }

    if (!result.Signature || result.Signature.byteLength === 0) {
      throw new Error(`KMS Sign returned empty Signature for ${opts.keyId}`);
    }
    if (result.Signature.byteLength !== 64) {
      throw new Error(
        `Unexpected Ed25519 signature length from KMS: ${result.Signature.byteLength}`,
      );
    }
    return result.Signature;
  }

  return {
    keyId: opts.keyId,
    algorithm: "Ed25519",
    publicKey,
    sign,
  };
}

/**
 * Preserve the KMS error code (NotFoundException, AccessDeniedException,
 * KMSInvalidStateException, etc.) in the rethrown message — callers turn
 * these into user-visible "Signing failed; contact support" toasts and the
 * code helps the operator triage from CloudTrail.
 */
function formatAwsError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    const name = e.name ?? "Error";
    const message = e.message ?? "(no message)";
    const status = e.$metadata?.httpStatusCode;
    return status ? `${name}[${status}] ${message}` : `${name} ${message}`;
  }
  return String(err);
}
