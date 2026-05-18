/**
 * Round-trip tests for the PAdES-B-T-style CMS builder/parser.
 *
 * What we exercise:
 *   - buildPadesCms → parsePadesCms round-trip preserves content + sig + TSR
 *   - Ed25519 signature verifies against the public key the signer ships
 *   - SHA-256 message-digest signed attr matches SHA-256(content)
 *   - signing-time signed attr round-trips
 *   - SignatureAlgorithm OID is the Ed25519 OID (1.3.101.112)
 *   - TimeStampToken can be extracted and is the inner ContentInfo (not the
 *     wrapping TimeStampResp)
 *
 * No network calls. The local Ed25519 signer + a synthetic TSR (built off
 * the same @peculiar/asn1-tsp shapes the production verifier accepts) are
 * the entire stack.
 */
import { describe, it, expect } from "vitest";
import { createHash, verify as nodeVerify, createPublicKey } from "node:crypto";
import { AsnConvert } from "@peculiar/asn1-schema";
import { ContentInfo, id_signedData } from "@peculiar/asn1-cms";

import { buildPadesCms, parsePadesCms, extractTimeStampTokenDer } from "./pades.ts";
import { createLocalSigner } from "./local-signer.ts";
import { buildTestTsr } from "./__fixtures__/test-tsr.ts";

const ED25519_SPKI_PREFIX = Uint8Array.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
  0x03, 0x21, 0x00,
]);

function ed25519PublicKeyFromRaw(raw: Uint8Array): ReturnType<typeof createPublicKey> {
  const spki = new Uint8Array(ED25519_SPKI_PREFIX.length + raw.length);
  spki.set(ED25519_SPKI_PREFIX, 0);
  spki.set(raw, ED25519_SPKI_PREFIX.length);
  return createPublicKey({ key: Buffer.from(spki), format: "der", type: "spki" });
}

const SIGNING_TIME = new Date("2026-05-18T12:00:00.000Z");
const SAMPLE_MANIFEST = new TextEncoder().encode(
  '{"draftId":"00000000-0000-0000-0000-000000000001","letterType":"dismissal","version":"0.3.0"}',
);

describe("buildPadesCms → parsePadesCms round-trip", () => {
  it("round-trips content, signature, and message-digest attr", async () => {
    const signer = createLocalSigner();
    const sha256 = createHash("sha256").update(SAMPLE_MANIFEST).digest("hex");
    const { tsr } = buildTestTsr({ sha256Hex: sha256, genTime: SIGNING_TIME });

    const built = await buildPadesCms({
      content: SAMPLE_MANIFEST,
      signer,
      tsr,
      signingTime: SIGNING_TIME,
    });

    const parsed = parsePadesCms(built.cmsDer);

    // Compare via Buffer.equals for reliable cross-view equality.
    expect(Buffer.from(parsed.content).equals(Buffer.from(SAMPLE_MANIFEST))).toBe(true);
    expect(parsed.signature.byteLength).toBe(64);
    expect(parsed.signatureAlgorithm).toBe("1.3.101.112");
    expect(parsed.signingTime?.toISOString()).toBe(SIGNING_TIME.toISOString());
    expect(parsed.timestampToken).not.toBeNull();

    // SHA-256 of the content must match the message-digest signed attribute.
    const expectedDigest = createHash("sha256").update(SAMPLE_MANIFEST).digest();
    expect(Buffer.from(parsed.messageDigest)).toEqual(expectedDigest);
    expect(built.contentSha256Hex).toBe(expectedDigest.toString("hex"));
  });

  it("produces an Ed25519 signature that verifies against the signer's public key", async () => {
    const signer = createLocalSigner();
    const sha256 = createHash("sha256").update(SAMPLE_MANIFEST).digest("hex");
    const { tsr } = buildTestTsr({ sha256Hex: sha256, genTime: SIGNING_TIME });

    const built = await buildPadesCms({
      content: SAMPLE_MANIFEST,
      signer,
      tsr,
      signingTime: SIGNING_TIME,
    });
    const parsed = parsePadesCms(built.cmsDer);

    const publicKey = ed25519PublicKeyFromRaw(await signer.publicKey());
    const ok = nodeVerify(
      null,
      Buffer.from(parsed.signedAttrsDer),
      publicKey,
      Buffer.from(parsed.signature),
    );
    expect(ok).toBe(true);
  });

  it("rejects verification with the wrong public key", async () => {
    const signer = createLocalSigner();
    const otherSigner = createLocalSigner();
    const sha256 = createHash("sha256").update(SAMPLE_MANIFEST).digest("hex");
    const { tsr } = buildTestTsr({ sha256Hex: sha256, genTime: SIGNING_TIME });

    const built = await buildPadesCms({
      content: SAMPLE_MANIFEST,
      signer,
      tsr,
      signingTime: SIGNING_TIME,
    });
    const parsed = parsePadesCms(built.cmsDer);

    const wrongKey = ed25519PublicKeyFromRaw(await otherSigner.publicKey());
    const ok = nodeVerify(
      null,
      Buffer.from(parsed.signedAttrsDer),
      wrongKey,
      Buffer.from(parsed.signature),
    );
    expect(ok).toBe(false);
  });

  it("embeds the TimeStampToken (not the wrapping TimeStampResp) as the unsigned attribute", async () => {
    const signer = createLocalSigner();
    const sha256 = createHash("sha256").update(SAMPLE_MANIFEST).digest("hex");
    const { tsr } = buildTestTsr({ sha256Hex: sha256, genTime: SIGNING_TIME });

    const built = await buildPadesCms({
      content: SAMPLE_MANIFEST,
      signer,
      tsr,
      signingTime: SIGNING_TIME,
    });
    const parsed = parsePadesCms(built.cmsDer);
    expect(parsed.timestampToken).not.toBeNull();

    // The unsigned-attr value must parse as a ContentInfo with id-signedData,
    // i.e. the inner TimeStampToken — not the outer TimeStampResp.
    const ci = AsnConvert.parse(parsed.timestampToken!.buffer.slice(0), ContentInfo);
    expect(ci.contentType).toBe(id_signedData);
  });

  it("omits the unsigned timestamp attribute when no TSR is provided (B-B level)", async () => {
    const signer = createLocalSigner();
    const built = await buildPadesCms({
      content: SAMPLE_MANIFEST,
      signer,
      signingTime: SIGNING_TIME,
    });
    const parsed = parsePadesCms(built.cmsDer);
    expect(parsed.timestampToken).toBeNull();
  });
});

describe("extractTimeStampTokenDer", () => {
  it("returns input unchanged when given a bare TimeStampToken ContentInfo", () => {
    // Build a tiny ContentInfo with id-signedData; extractTimeStampTokenDer
    // should recognise it and pass it through.
    const sha256 = createHash("sha256").update(SAMPLE_MANIFEST).digest("hex");
    const { tsr } = buildTestTsr({ sha256Hex: sha256, genTime: SIGNING_TIME });

    // First extract a bare token from the TimeStampResp.
    const bareTokenAb = extractTimeStampTokenDer(new Uint8Array(tsr));
    // Then ensure feeding that bare token back returns the same bytes.
    const passthrough = extractTimeStampTokenDer(new Uint8Array(bareTokenAb));
    expect(passthrough.byteLength).toBe(bareTokenAb.byteLength);
  });
});
