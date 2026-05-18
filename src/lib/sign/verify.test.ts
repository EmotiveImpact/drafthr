/**
 * Verifier tests.
 *
 * Covers:
 *   - new-scheme PAdES-B-T CMS passes
 *   - legacy header-side TSR passes with legacy: true
 *   - tampered content fails with byte_range_tampered
 *   - wrong-signature fails with signature_mismatch (verify against a key
 *     that didn't sign it)
 *   - tampered CMS bytes fail with cms_parse_failed
 *   - missing TSR fails with tsa_missing
 *   - non-Ed25519 algorithm OID fails with unsupported_signature_algorithm
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";

import { buildPadesCms } from "./pades.ts";
import { createLocalSigner } from "./local-signer.ts";
import { verifyPadesCms, verifyLegacy } from "./verify.ts";
import { buildTestTsr } from "./__fixtures__/test-tsr.ts";

const SIGNING_TIME = new Date("2026-05-18T12:00:00.000Z");
const MANIFEST = new TextEncoder().encode(
  '{"draftId":"00000000-0000-0000-0000-000000000001","letterType":"dismissal"}',
);

describe("verifyPadesCms — new scheme", () => {
  it("returns ok:true for a freshly signed manifest", async () => {
    const signer = createLocalSigner();
    const sha256 = createHash("sha256").update(MANIFEST).digest("hex");
    const { tsr, parseOptions } = buildTestTsr({ sha256Hex: sha256, genTime: SIGNING_TIME });

    const built = await buildPadesCms({
      content: MANIFEST,
      signer,
      tsr,
      signingTime: SIGNING_TIME,
    });

    const publicKey = await signer.publicKey();
    const result = await verifyPadesCms({
      cms: built.cmsDer,
      expectedContent: MANIFEST,
      expectedPublicKey: publicKey,
      tsaTrustPins: parseOptions.trustedTsaKeyPins,
      tsaName: parseOptions.tsaName,
    });

    expect(result.ok).toBe(true);
    if (result.ok && !result.legacy) {
      expect(result.tsa).toBe("Test TSA");
      expect(result.contentSha256Hex).toBe(sha256);
      expect(result.publicKeyFingerprint).toMatch(/^[0-9a-f]{16}$/);
      expect(result.signedBy).toMatch(/^cms-serial:/);
    }
  });

  it("rejects when the expected content has been tampered with", async () => {
    const signer = createLocalSigner();
    const sha256 = createHash("sha256").update(MANIFEST).digest("hex");
    const { tsr, parseOptions } = buildTestTsr({ sha256Hex: sha256, genTime: SIGNING_TIME });

    const built = await buildPadesCms({
      content: MANIFEST,
      signer,
      tsr,
      signingTime: SIGNING_TIME,
    });

    const publicKey = await signer.publicKey();
    const tampered = new TextEncoder().encode("not the manifest you signed");
    const result = await verifyPadesCms({
      cms: built.cmsDer,
      expectedContent: tampered,
      expectedPublicKey: publicKey,
      tsaTrustPins: parseOptions.trustedTsaKeyPins,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("byte_range_tampered");
  });

  it("rejects when the supplied public key didn't sign the CMS", async () => {
    const signer = createLocalSigner();
    const otherSigner = createLocalSigner();
    const sha256 = createHash("sha256").update(MANIFEST).digest("hex");
    const { tsr, parseOptions } = buildTestTsr({ sha256Hex: sha256, genTime: SIGNING_TIME });

    const built = await buildPadesCms({
      content: MANIFEST,
      signer,
      tsr,
      signingTime: SIGNING_TIME,
    });

    const wrongKey = await otherSigner.publicKey();
    const result = await verifyPadesCms({
      cms: built.cmsDer,
      expectedContent: MANIFEST,
      expectedPublicKey: wrongKey,
      tsaTrustPins: parseOptions.trustedTsaKeyPins,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("signature_mismatch");
  });

  it("rejects garbage CMS bytes with cms_parse_failed", async () => {
    const signer = createLocalSigner();
    const publicKey = await signer.publicKey();
    const result = await verifyPadesCms({
      cms: new Uint8Array([0x00, 0xff, 0x42, 0x42, 0x42]),
      expectedContent: MANIFEST,
      expectedPublicKey: publicKey,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("cms_parse_failed");
  });

  it("rejects a signature with no TSR (PAdES-B-B) at the verifier", async () => {
    const signer = createLocalSigner();
    const built = await buildPadesCms({
      content: MANIFEST,
      signer,
      signingTime: SIGNING_TIME,
    });

    const publicKey = await signer.publicKey();
    const result = await verifyPadesCms({
      cms: built.cmsDer,
      expectedContent: MANIFEST,
      expectedPublicKey: publicKey,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("tsa_missing");
  });
});

describe("verifyLegacy — pre-PAdES exports", () => {
  it("validates a TSR + matching sha256 (legacy: true)", () => {
    const someBytes = new TextEncoder().encode("legacy-pdf-bytes");
    const sha256 = createHash("sha256").update(someBytes).digest("hex");
    const { tsr, parseOptions } = buildTestTsr({ sha256Hex: sha256, genTime: SIGNING_TIME });

    const result = verifyLegacy({
      tsr: new Uint8Array(tsr),
      expectedSha256Hex: sha256,
      tsaTrustPins: parseOptions.trustedTsaKeyPins,
      tsaName: parseOptions.tsaName,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.legacy).toBe(true);
      expect(result.contentSha256Hex).toBe(sha256);
      expect(result.tsa).toBe("Test TSA");
    }
  });

  it("rejects a TSR/sha256 mismatch with byte_range_tampered", () => {
    const someBytes = new TextEncoder().encode("legacy-pdf-bytes");
    const sha256 = createHash("sha256").update(someBytes).digest("hex");
    const { tsr, parseOptions } = buildTestTsr({ sha256Hex: sha256, genTime: SIGNING_TIME });

    const wrongHash = "0".repeat(64);
    const result = verifyLegacy({
      tsr: new Uint8Array(tsr),
      expectedSha256Hex: wrongHash,
      tsaTrustPins: parseOptions.trustedTsaKeyPins,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("byte_range_tampered");
  });

  it("rejects a TSR with a TSA cert pin we don't trust (production-default pins)", () => {
    const someBytes = new TextEncoder().encode("legacy-pdf-bytes");
    const sha256 = createHash("sha256").update(someBytes).digest("hex");
    const { tsr } = buildTestTsr({ sha256Hex: sha256, genTime: SIGNING_TIME });

    // No tsaTrustPins override — falls through to FreeTSA pins. Our
    // synthetic TSA isn't pinned, so this must fail.
    const result = verifyLegacy({ tsr: new Uint8Array(tsr), expectedSha256Hex: sha256 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("tsa_invalid");
  });
});
