/**
 * RFC 3161 trusted-timestamp client (FreeTSA).
 *
 * The point: prove a PDF existed in its exact form at a specific UTC moment,
 * signed by an independent third party. We send a SHA-256 hash, get back a
 * CMS-signed TimeStampToken. The TSR (binary, base64-encoded for transport)
 * is stored in the audit_events payload; verification can be performed by
 * any party with the original PDF + the stored TSR.
 *
 * Defensive posture: if FreeTSA is unreachable or returns garbage, requestTsr
 * returns null. Tribunal-grade defensibility prefers a partial trail (the
 * hash chain still records the export) over a failed export — the user must
 * be able to deliver the letter.
 */

import { createHash, createVerify, X509Certificate } from "node:crypto";
import * as asn1js from "asn1js";
import { OctetString, AsnConvert } from "@peculiar/asn1-schema";
import { AlgorithmIdentifier } from "@peculiar/asn1-x509";
import type { Certificate } from "@peculiar/asn1-x509";
import {
  SignedData,
  id_contentType,
  id_messageDigest,
  id_signedData,
} from "@peculiar/asn1-cms";
import type { Attribute } from "@peculiar/asn1-cms";
import {
  MessageImprint,
  PKIStatus,
  TimeStampReq,
  TimeStampReqVersion,
  TimeStampResp,
  TSTInfo,
} from "@peculiar/asn1-tsp";

// SHA-256 — the only digest we ever submit. FreeTSA accepts SHA-256.
const OID_SHA256 = "2.16.840.1.101.3.4.2.1";
const OID_SHA384 = "2.16.840.1.101.3.4.2.2";
const OID_SHA512 = "2.16.840.1.101.3.4.2.3";
const OID_RSA_ENCRYPTION = "1.2.840.113549.1.1.1";
const OID_RSA_SHA256 = "1.2.840.113549.1.1.11";
const OID_RSA_SHA384 = "1.2.840.113549.1.1.12";
const OID_RSA_SHA512 = "1.2.840.113549.1.1.13";
const OID_ECDSA_SHA256 = "1.2.840.10045.4.3.2";
const OID_ECDSA_SHA384 = "1.2.840.10045.4.3.3";
const OID_ECDSA_SHA512 = "1.2.840.10045.4.3.4";
const OID_TST_INFO = "1.2.840.113549.1.9.16.1.4";
const FREETSA_URL = "https://freetsa.org/tsr";
const FREETSA_TIMEOUT_MS = 10_000;

// FreeTSA publishes the SHA-256 of its TSA signing key beside tsa.crt.
// Source: https://www.freetsa.org/ (checked 2026-05-16). Each pin must be a
// 64-char (lowercase) SHA-256 hex string — certificatePinCandidates() only
// ever produces 64-char hashes, so any other length can never match.
//
// NOTE: a previous "legacy" pin for pre-March-2026 timestamps was stored as a
// 65-char string (one stray hex digit), so it was dead — it could never match
// and silently failed verification for timestamps signed by the rotated-out
// key. The corrupted value was unrecoverable (the original 64-char hash was
// lost), so it has been removed rather than guessed. Removing it changes no
// behaviour: a dead pin never matched anything. If pre-rotation FreeTSA
// timestamps must be verifiable, re-add the authoritative 64-char SHA-256 of
// the legacy FreeTSA signing certificate here.
const FREETSA_TSA_KEY_SHA256_PINS = [
  "899ba3d9f777e2a74bdd34302bc06cb3f7a46ac1f565ee128f79fd5dab99d68b",
];

// Guard against re-introducing a wrong-length pin: a non-64-char hex string is
// always dead, so fail loudly in dev/test rather than degrade silently.
if (
  FREETSA_TSA_KEY_SHA256_PINS.some((p) => !/^[0-9a-f]{64}$/.test(p))
) {
  throw new Error(
    "FREETSA_TSA_KEY_SHA256_PINS contains a non-64-char-hex pin — it can never match a SHA-256.",
  );
}

export type TsrParseOk = {
  ok: true;
  sha256Hex: string;
  signedAtUtc: Date;
  tsaName: string;
};

export type TsrParseFail = { ok: false; reason: string };

export type TsrParseOptions = {
  trustedTsaKeyPins?: readonly string[];
  tsaName?: string;
};

/**
 * Request a trusted RFC 3161 timestamp from FreeTSA for a SHA-256 hash.
 * Returns the binary TSR (TimeStampResponse) or null on any failure —
 * caller continues without it (audit event marks tsa: unavailable).
 */
export async function requestTsr(
  sha256Hex: string,
  parseOptions?: TsrParseOptions,
): Promise<Buffer | null> {
  if (!isHex64(sha256Hex)) return null;

  const tsq = encodeTsq(sha256Hex);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FREETSA_TIMEOUT_MS);

  try {
    const res = await fetch(FREETSA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/timestamp-query",
        Accept: "application/timestamp-reply",
      },
      body: tsq,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Sanity-check it parses + status is granted before we hand it back.
    const parsed = parseTsr(buf, parseOptions);
    if (!parsed.ok) return null;
    if (parsed.sha256Hex.toLowerCase() !== sha256Hex.toLowerCase()) return null;
    return buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse a TSR binary blob and extract the imprint hash + signed UTC time.
 * Used by the verify endpoint and by requestTsr's sanity-check path.
 *
 * This validates the CMS signature over the TSTInfo before returning ok:true.
 */
export function parseTsr(
  tsr: Buffer | Uint8Array,
  options: TsrParseOptions = {},
): TsrParseOk | TsrParseFail {
  let resp: TimeStampResp;
  try {
    resp = AsnConvert.parse(toArrayBuffer(tsr), TimeStampResp);
  } catch (err) {
    return { ok: false, reason: `tsr parse failed: ${errMessage(err)}` };
  }

  if (
    resp.status.status !== PKIStatus.granted &&
    resp.status.status !== PKIStatus.grantedWithMods
  ) {
    return { ok: false, reason: `tsa rejected request (status=${resp.status.status})` };
  }
  if (!resp.timeStampToken) {
    return { ok: false, reason: "missing timeStampToken" };
  }

  const token = resp.timeStampToken;
  if (token.contentType !== id_signedData) {
    return { ok: false, reason: `unexpected token contentType ${token.contentType}` };
  }

  let signed: SignedData;
  try {
    signed = AsnConvert.parse(token.content, SignedData);
  } catch (err) {
    return { ok: false, reason: `signed-data parse failed: ${errMessage(err)}` };
  }

  if (signed.encapContentInfo.eContentType !== OID_TST_INFO) {
    return { ok: false, reason: "invalid_signature" };
  }

  const eContent = signed.encapContentInfo.eContent;
  // Per RFC 3161 the eContent is a TSTInfo wrapped in an OCTET STRING.
  const tstInfoBuf = eContent?.single ? toArrayBuffer(eContent.single.buffer) : eContent?.any;
  if (!tstInfoBuf) {
    return { ok: false, reason: "tst info missing" };
  }

  let tst: TSTInfo;
  try {
    tst = AsnConvert.parse(tstInfoBuf, TSTInfo);
  } catch (err) {
    return { ok: false, reason: `tst info parse failed: ${errMessage(err)}` };
  }

  const imprint = tst.messageImprint;
  if (imprint.hashAlgorithm.algorithm !== OID_SHA256) {
    return {
      ok: false,
      reason: `unexpected hash algorithm ${imprint.hashAlgorithm.algorithm}`,
    };
  }

  const signatureOk = verifyTstInfoSignature(signed, tstInfoBuf, options);
  if (!signatureOk) return { ok: false, reason: "invalid_signature" };

  const sha256Hex = bytesToHex(new Uint8Array(toArrayBuffer(imprint.hashedMessage.buffer)));

  return {
    ok: true,
    sha256Hex,
    signedAtUtc: tst.genTime,
    tsaName: options.tsaName ?? "FreeTSA",
  };
}

function verifyTstInfoSignature(
  signed: SignedData,
  tstInfoDer: ArrayBuffer,
  options: TsrParseOptions,
): boolean {
  try {
    const signer = signed.signerInfos[0];
    if (!signer || signed.signerInfos.length !== 1) return false;
    if (!signer.signedAttrs?.length) return false;

    const trustedCert = findTrustedSigningCertificate(
      signed,
      options.trustedTsaKeyPins ?? FREETSA_TSA_KEY_SHA256_PINS,
    );
    if (!trustedCert) return false;

    const contentType = readOidAttribute(signer.signedAttrs, id_contentType);
    if (contentType !== OID_TST_INFO) return false;

    const digestAlgorithm = digestNameFromOid(signer.digestAlgorithm.algorithm);
    if (!digestAlgorithm) return false;

    const signedDigest = readOctetStringAttribute(signer.signedAttrs, id_messageDigest);
    if (!signedDigest) return false;

    const expectedDigest = createHash(digestAlgorithm)
      .update(Buffer.from(tstInfoDer))
      .digest();
    if (!Buffer.from(signedDigest).equals(expectedDigest)) return false;

    const signedAttrsDer = encodeSignedAttributes(signer.signedAttrs);

    const signatureDigest = signatureDigestName(
      signer.signatureAlgorithm.algorithm,
      signer.digestAlgorithm.algorithm,
    );
    if (!signatureDigest) return false;

    const verifier = createVerify(signatureDigest);
    verifier.update(signedAttrsDer);
    verifier.end();
    return verifier.verify(
      trustedCert.publicKey,
      Buffer.from(toArrayBuffer(signer.signature.buffer)),
    );
  } catch {
    return false;
  }
}

function findTrustedSigningCertificate(
  signed: SignedData,
  trustedPins: readonly string[],
): X509Certificate | null {
  const pinSet = new Set(trustedPins.map((pin) => pin.toLowerCase()));
  for (const choice of signed.certificates ?? []) {
    const certificate = choice.certificate;
    if (!certificate) continue;

    const certDer = Buffer.from(AsnConvert.serialize(certificate));
    const pinCandidates = certificatePinCandidates(certDer, certificate);
    if (!pinCandidates.some((pin) => pinSet.has(pin))) continue;
    return new X509Certificate(certDer);
  }
  return null;
}

function certificatePinCandidates(certDer: Buffer, certificate: Certificate): string[] {
  const pins = [
    sha256Hex(certDer),
    sha256Hex(
      Buffer.from(toArrayBuffer(certificate.tbsCertificate.subjectPublicKeyInfo.subjectPublicKey)),
    ),
  ];

  try {
    const x509 = new X509Certificate(certDer);
    const spkiDer = x509.publicKey.export({ format: "der", type: "spki" });
    if (Buffer.isBuffer(spkiDer)) pins.push(sha256Hex(spkiDer));
  } catch {
    // If Node cannot parse the certificate, the DER/key pins above still let
    // findTrustedSigningCertificate reject it cleanly.
  }

  return [...new Set(pins)];
}

function readOidAttribute(attrs: Attribute[], oid: string): string | null {
  const value = readSingleAttributeValue(attrs, oid);
  if (!value) return null;
  const parsed = asn1js.fromBER(value);
  if (parsed.offset === -1 || !(parsed.result instanceof asn1js.ObjectIdentifier)) return null;
  return parsed.result.valueBlock.toString();
}

function readOctetStringAttribute(attrs: Attribute[], oid: string): ArrayBuffer | null {
  const value = readSingleAttributeValue(attrs, oid);
  if (!value) return null;
  try {
    return toArrayBuffer(AsnConvert.parse(value, OctetString).buffer);
  } catch {
    return null;
  }
}

function readSingleAttributeValue(attrs: Attribute[], oid: string): ArrayBuffer | null {
  const matching = attrs.filter((attr) => attr.attrType === oid);
  if (matching.length !== 1) return null;
  const attr = matching[0];
  if (!attr || attr.attrValues.length !== 1) return null;
  return attr.attrValues[0] ?? null;
}

function encodeSignedAttributes(attrs: Attribute[]): Buffer {
  const encodedAttrs = attrs
    .map((attr) => Buffer.from(AsnConvert.serialize(attr)))
    .sort(Buffer.compare);
  return encodeDer(0x31, Buffer.concat(encodedAttrs));
}

function encodeDer(tag: number, content: Buffer): Buffer {
  if (content.length < 0x80) return Buffer.concat([Buffer.from([tag, content.length]), content]);

  const lengthBytes: number[] = [];
  let length = content.length;
  while (length > 0) {
    lengthBytes.unshift(length & 0xff);
    length >>= 8;
  }
  return Buffer.concat([
    Buffer.from([tag, 0x80 | lengthBytes.length, ...lengthBytes]),
    content,
  ]);
}

function digestNameFromOid(oid: string): "sha256" | "sha384" | "sha512" | null {
  switch (oid) {
    case OID_SHA256:
      return "sha256";
    case OID_SHA384:
      return "sha384";
    case OID_SHA512:
      return "sha512";
    default:
      return null;
  }
}

function signatureDigestName(
  signatureOid: string,
  digestOid: string,
): "sha256" | "sha384" | "sha512" | null {
  switch (signatureOid) {
    case OID_ECDSA_SHA256:
    case OID_RSA_SHA256:
      return "sha256";
    case OID_ECDSA_SHA384:
    case OID_RSA_SHA384:
      return "sha384";
    case OID_ECDSA_SHA512:
    case OID_RSA_SHA512:
      return "sha512";
    case OID_RSA_ENCRYPTION:
      return digestNameFromOid(digestOid);
    default:
      return null;
  }
}

function encodeTsq(sha256Hex: string): Buffer {
  const hashBytes = hexToBytes(sha256Hex);
  const req = new TimeStampReq({
    version: TimeStampReqVersion.v1,
    messageImprint: new MessageImprint({
      hashAlgorithm: new AlgorithmIdentifier({ algorithm: OID_SHA256 }),
      hashedMessage: new OctetString(hashBytes.buffer.slice(0)),
    }),
    // certReq=true so FreeTSA includes its signing cert in the response —
    // necessary for offline signature verification later.
    certReq: true,
  });
  return Buffer.from(AsnConvert.serialize(req));
}

function isHex64(s: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(s);
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

function sha256Hex(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function toArrayBuffer(src: ArrayBuffer | ArrayBufferView | Buffer): ArrayBuffer {
  if (src instanceof ArrayBuffer) return src;
  // Slice to detach from the underlying pool (Node Buffer shares memory).
  return src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) as ArrayBuffer;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
