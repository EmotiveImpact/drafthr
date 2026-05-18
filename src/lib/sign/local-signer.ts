/**
 * In-process Ed25519 signer for development, tests, and CI.
 *
 * The seed comes from DRAFTHR_SIGNING_KEY_HEX (32 raw bytes, hex-encoded).
 * If absent, mints a fresh ephemeral key — fine for tests and local browser
 * sessions, never use this for a real export.
 *
 * In production, getActiveSigner() prefers the KMS-backed signer
 * (createKmsSigner) and only falls back to this when SIGNING_KMS_KEY_ID is
 * unset. We never silently fall back from KMS to here on a KMS error —
 * that would defeat the security model.
 *
 * Uses Node's built-in node:crypto Ed25519 support (added in Node 12.0)
 * rather than introducing a third-party @noble/ed25519 dep, since the rest
 * of the signing pipeline already lives in api/ (Node-only).
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as nodeSign,
  type KeyObject,
} from "node:crypto";

import type { KmsSigner } from "./types.js";

type LocalSignerOptions = {
  /** 32-byte Ed25519 seed, hex-encoded. If omitted, mints an ephemeral key. */
  keyHex?: string;
};

/** Ed25519 OID per RFC 8410 §3 — used to wrap the 32-byte seed into a
 *  PKCS#8 PrivateKeyInfo so node:crypto can import it. */
const ED25519_PKCS8_PREFIX = Buffer.from([
  0x30, 0x2e, // SEQUENCE (46 bytes)
  0x02, 0x01, 0x00, // INTEGER version 0
  0x30, 0x05, // SEQUENCE (5 bytes) — AlgorithmIdentifier
  0x06, 0x03, 0x2b, 0x65, 0x70, // OID 1.3.101.112 = ed25519
  0x04, 0x22, // OCTET STRING (34 bytes)
  0x04, 0x20, // — inner OCTET STRING (32 bytes)
]);

export function createLocalSigner(opts: LocalSignerOptions = {}): KmsSigner {
  const { privateKey, publicKeyRaw } = importOrMintKey(opts.keyHex);

  // Use a fingerprint of the public key as the keyId — verifiers can use it
  // to bind a CMS signature to a specific local-signer instance.
  const keyId = `local:ed25519:${createHash("sha256")
    .update(publicKeyRaw)
    .digest("hex")
    .slice(0, 16)}`;

  return {
    keyId,
    algorithm: "Ed25519",
    async publicKey(): Promise<Uint8Array> {
      return publicKeyRaw;
    },
    async sign(message: Uint8Array): Promise<Uint8Array> {
      // node:crypto sign() returns the 64-byte raw Ed25519 signature when the
      // key is an Ed25519 KeyObject and algorithm is null (which is what
      // Ed25519 requires per RFC 8032 — no separate digest).
      const sig = nodeSign(null, Buffer.from(message), privateKey);
      return new Uint8Array(sig.buffer, sig.byteOffset, sig.byteLength);
    },
  };
}

function importOrMintKey(keyHex: string | undefined): {
  privateKey: KeyObject;
  publicKeyRaw: Uint8Array;
} {
  if (keyHex && keyHex.trim().length > 0) {
    const seed = parseSeed(keyHex.trim());
    const pkcs8 = Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(seed)]);
    const privateKey = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
    const publicKeyRaw = extractRawPublicKey(privateKey);
    return { privateKey, publicKeyRaw };
  }

  // Ephemeral fallback. The same process keeps the key for its lifetime,
  // so within one Vercel function invocation everything still verifies.
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyRaw = extractRawPublicKeyFromPublic(publicKey);
  return { privateKey, publicKeyRaw };
}

function parseSeed(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("DRAFTHR_SIGNING_KEY_HEX must be hex");
  }
  if (hex.length !== 64) {
    throw new Error(
      `DRAFTHR_SIGNING_KEY_HEX must be 32 bytes (64 hex chars); got ${hex.length}`,
    );
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function extractRawPublicKey(privateKey: KeyObject): Uint8Array {
  return extractRawPublicKeyFromPublic(createPublicKey(privateKey));
}

function extractRawPublicKeyFromPublic(publicKey: KeyObject): Uint8Array {
  // SPKI for Ed25519: SEQUENCE { AlgorithmIdentifier(1.3.101.112), BIT STRING(0, pubkey32) }
  // We strip the 12-byte prefix to get the raw 32-byte public key.
  const spki = publicKey.export({ format: "der", type: "spki" });
  const der = Buffer.isBuffer(spki) ? spki : Buffer.from(spki);
  // The last 32 bytes of an Ed25519 SPKI are always the raw key.
  if (der.length < 32) {
    throw new Error(`unexpected Ed25519 SPKI length: ${der.length}`);
  }
  return new Uint8Array(der.subarray(der.length - 32));
}
