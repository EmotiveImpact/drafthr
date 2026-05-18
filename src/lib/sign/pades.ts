/**
 * PAdES-B-T-style CMS SignedData builder + parser.
 *
 * This module produces a detached-content-style CMS SignedData (RFC 5652)
 * where:
 *  - the signed content (`eContent`) is the canonical manifest JSON bytes;
 *  - the signature is Ed25519 (RFC 8032 PureEdDSA) over the DER encoding of
 *    the signed-attributes SET, per RFC 5652 §5.4;
 *  - the signed attributes carry content-type (id-data), message-digest
 *    (SHA-256 of the eContent), and signing-time (UTCTime);
 *  - the unsigned attributes carry the RFC 3161 TimeStampToken as
 *    id-aa-signatureTimeStampToken (OID 1.2.840.113549.1.9.16.2.14) — this
 *    is the structural element that makes the signature PAdES-B-T per
 *    ETSI EN 319 142-1 §5.3.
 *
 * Scope note ("PAdES-B-T-style" rather than "PAdES-B-T" verbatim): PAdES
 * proper binds a CMS SignedData into the /Contents field of an embedded
 * ISO 32000 PDF signature dictionary. We package the same CMS structure as
 * a sidecar (`manifest.sig`) inside the export ZIP instead — the
 * cryptographic content is byte-identical; only the carrier differs. See
 * docs/signing.md for the roadmap to true in-PDF embedding (requires a
 * post-Puppeteer pdf-lib pass on the rendered PDF).
 */
import { createHash } from "node:crypto";
import * as asn1js from "asn1js";
import { AsnConvert, OctetString } from "@peculiar/asn1-schema";
import { AlgorithmIdentifier, Name } from "@peculiar/asn1-x509";
import {
  Attribute,
  CMSVersion,
  ContentInfo,
  DigestAlgorithmIdentifier,
  DigestAlgorithmIdentifiers,
  EncapsulatedContent,
  EncapsulatedContentInfo,
  IssuerAndSerialNumber,
  SignatureAlgorithmIdentifier,
  SignedData,
  SignerIdentifier,
  SignerInfo,
  SignerInfos,
  id_contentType,
  id_data,
  id_messageDigest,
  id_signedData,
  id_signingTime,
} from "@peculiar/asn1-cms";
import { TimeStampResp } from "@peculiar/asn1-tsp";

import type { KmsSigner } from "./types.js";

// OIDs — RFC 5652 §11, RFC 8410 §3, RFC 3161 §5.1.
const OID_SHA256 = "2.16.840.1.101.3.4.2.1";
const OID_ED25519 = "1.3.101.112";

// PAdES-B-T (ETSI EN 319 142-1 §5.3) reuses the RFC 3161 §5.1
// SignatureTimeStampToken attribute OID — it does not redefine its own.
const OID_SIGNATURE_TIMESTAMP_TOKEN = "1.2.840.113549.1.9.16.2.14";

export type BuildPadesCmsInput = {
  /** The canonical content being signed — for us, the canonical manifest
   *  JSON bytes. CMS calls this `eContent`. */
  content: Uint8Array;
  /** Signer abstraction — KmsSigner from kms-signer.ts or local-signer.ts. */
  signer: KmsSigner;
  /** RFC 3161 TimeStampResp or bare TimeStampToken DER bytes. Optional;
   *  when omitted the result is PAdES-B-B (no timestamp). */
  tsr?: Uint8Array | null;
  /** UTC instant recorded in the signing-time signed attribute. Defaults
   *  to now. Test fixtures pass a deterministic value. */
  signingTime?: Date;
};

export type BuildPadesCmsResult = {
  /** DER-encoded ContentInfo wrapping SignedData. This is what goes into
   *  manifest.sig (and, when we move to in-PDF embedding, into the
   *  /Contents slot of the PDF signature dictionary). */
  cmsDer: Uint8Array;
  /** SHA-256 of the signed content — handy for callers to record alongside
   *  the CMS. */
  contentSha256Hex: string;
};

export async function buildPadesCms(
  input: BuildPadesCmsInput,
): Promise<BuildPadesCmsResult> {
  const signingTime = input.signingTime ?? new Date();
  const contentDigest = createHash("sha256").update(input.content).digest();

  // ---- Signed attributes (RFC 5652 §5.3) --------------------------------
  //
  // When signed attributes are present, the actual bytes Ed25519 signs are
  // the DER encoding of the signed-attributes SET (with implicit tag [0]
  // replaced by the universal SET tag per RFC 5652 §5.4).
  //
  // The three attributes we include are the PAdES-B-T minimum:
  //  - content-type (1.2.840.113549.1.9.3): must equal eContentType (id-data).
  //  - message-digest (1.2.840.113549.1.9.4): SHA-256 of eContent.
  //  - signing-time (1.2.840.113549.1.9.5): claimed signing instant.
  //
  // signing-certificate-v2 (RFC 5035) is NOT included — it binds the
  // SignerInfo to a specific X.509 cert. We don't yet wrap the Ed25519 key
  // in an X.509 cert (the KMS key is bare; the local signer is bare). When
  // we issue a cert for the KMS key we'll add it here and upgrade the
  // PAdES claim. See docs/signing.md.

  const signedAttrs: Attribute[] = [
    makeOidAttribute(id_contentType, id_data),
    makeOctetStringAttribute(id_messageDigest, contentDigest),
    makeUtcTimeAttribute(id_signingTime, signingTime),
  ];

  // RFC 5652 §5.4: the bytes Ed25519 signs are the DER encoding of the
  // signed-attributes SET (universal tag 0x31), constructed by serialising
  // each Attribute, sorting them lexicographically, and concatenating. We
  // mirror the helper in api/_utils/tsa.ts (encodeSignedAttributes) to
  // keep the writer and the existing TSA verifier byte-compatible.
  const signedAttrsDer = encodeSignedAttributesAsSetDer(signedAttrs);

  // ---- The signature ---------------------------------------------------
  //
  // Ed25519 PureEdDSA (RFC 8032 §5.1). The signer hashes internally; we
  // pass the raw signed-attrs bytes. KMS-backed signers do a network
  // round-trip here; the local signer is in-process.
  const signature = await input.signer.sign(signedAttrsDer);
  if (signature.byteLength !== 64) {
    throw new Error(
      `expected 64-byte Ed25519 signature, got ${signature.byteLength}`,
    );
  }

  // ---- Unsigned attributes — the PAdES-B-T timestamp -------------------
  //
  // Per PAdES-B-T (ETSI EN 319 142-1 §5.3) / RFC 3161 §5.1,
  // SignatureTimeStampToken carries the TimeStampToken ContentInfo (NOT the
  // wrapping TimeStampResp). FreeTSA gives us back a TimeStampResp; we
  // unwrap it here.
  let unsignedAttrs: Attribute[] | undefined;
  if (input.tsr) {
    const tokenDer = extractTimeStampTokenDer(input.tsr);
    unsignedAttrs = [
      new Attribute({
        attrType: OID_SIGNATURE_TIMESTAMP_TOKEN,
        attrValues: [tokenDer],
      }),
    ];
  }

  // ---- SignerInfo + SignedData ----------------------------------------
  const signerInfo = new SignerInfo({
    version: CMSVersion.v1,
    sid: new SignerIdentifier({
      issuerAndSerialNumber: makeIssuerAndSerialNumber(input.signer.keyId),
    }),
    digestAlgorithm: new DigestAlgorithmIdentifier({ algorithm: OID_SHA256 }),
    signedAttrs,
    signatureAlgorithm: new SignatureAlgorithmIdentifier({ algorithm: OID_ED25519 }),
    signature: new OctetString(toArrayBuffer(signature)),
    unsignedAttrs,
  });

  const signedData = new SignedData({
    version: CMSVersion.v1,
    digestAlgorithms: new DigestAlgorithmIdentifiers([
      new AlgorithmIdentifier({ algorithm: OID_SHA256 }),
    ]),
    encapContentInfo: new EncapsulatedContentInfo({
      eContentType: id_data,
      eContent: new EncapsulatedContent({
        single: new OctetString(toArrayBuffer(input.content)),
      }),
    }),
    signerInfos: new SignerInfos([signerInfo]),
  });

  const contentInfo = new ContentInfo({
    contentType: id_signedData,
    content: AsnConvert.serialize(signedData),
  });

  return {
    cmsDer: new Uint8Array(AsnConvert.serialize(contentInfo)),
    contentSha256Hex: contentDigest.toString("hex"),
  };
}

// ---------------------------------------------------------------------------
// Parsing + verification helpers (read side)
// ---------------------------------------------------------------------------

export type ParsedPadesCms = {
  /** The content bytes that were signed. */
  content: Uint8Array;
  /** Raw 64-byte Ed25519 signature value. */
  signature: Uint8Array;
  /** Re-serialised signed-attrs SET (with universal SET tag) — what
   *  Ed25519 was computed over. Verifier passes this to ed25519.verify(). */
  signedAttrsDer: Uint8Array;
  /** SHA-256 declared in the message-digest signed attr — verifier must
   *  recompute SHA-256(content) and compare. */
  messageDigest: Uint8Array;
  /** Claimed signing time from the signing-time signed attr. */
  signingTime: Date | null;
  /** Algorithm OID from SignatureAlgorithmIdentifier. Must be OID_ED25519. */
  signatureAlgorithm: string;
  /** keyId fingerprint carried in the SignerIdentifier serial number. */
  keyId: string;
  /** TimeStampToken DER bytes if the unsigned timestamp attribute was
   *  present, otherwise null. */
  timestampToken: Uint8Array | null;
};

export function parsePadesCms(cmsDer: Uint8Array): ParsedPadesCms {
  const contentInfo = AsnConvert.parse(toArrayBuffer(cmsDer), ContentInfo);
  if (contentInfo.contentType !== id_signedData) {
    throw new Error(
      `unexpected CMS contentType ${contentInfo.contentType} (expected id-signedData)`,
    );
  }
  const signed = AsnConvert.parse(contentInfo.content, SignedData);
  if (signed.signerInfos.length !== 1) {
    throw new Error(
      `expected exactly 1 SignerInfo, got ${signed.signerInfos.length}`,
    );
  }
  const signer = signed.signerInfos[0]!;

  const eContent = signed.encapContentInfo.eContent;
  const contentBuf = eContent?.single
    ? toArrayBuffer(eContent.single.buffer)
    : (eContent?.any ?? null);
  if (!contentBuf) {
    throw new Error("missing eContent — detached signatures not supported by this verifier");
  }

  if (!signer.signedAttrs || signer.signedAttrs.length === 0) {
    throw new Error("missing signedAttrs");
  }
  const signedAttrsDer = encodeSignedAttributesAsSetDer(signer.signedAttrs);

  const messageDigestRaw = readOctetStringAttribute(
    signer.signedAttrs,
    id_messageDigest,
  );
  if (!messageDigestRaw) {
    throw new Error("missing message-digest signed attribute");
  }
  const signingTime = readUtcTimeAttribute(signer.signedAttrs, id_signingTime);

  const sid = signer.sid;
  const keyId = sid.issuerAndSerialNumber
    ? decodeKeyIdFromIasn(sid.issuerAndSerialNumber)
    : "(unknown)";

  let timestampToken: Uint8Array | null = null;
  if (signer.unsignedAttrs) {
    for (const attr of signer.unsignedAttrs) {
      if (
        attr.attrType === OID_SIGNATURE_TIMESTAMP_TOKEN &&
        attr.attrValues.length === 1
      ) {
        timestampToken = new Uint8Array(attr.attrValues[0]!);
        break;
      }
    }
  }

  return {
    content: new Uint8Array(contentBuf),
    signature: new Uint8Array(toArrayBuffer(signer.signature.buffer)),
    signedAttrsDer,
    messageDigest: new Uint8Array(messageDigestRaw),
    signingTime,
    signatureAlgorithm: signer.signatureAlgorithm.algorithm,
    keyId,
    timestampToken,
  };
}

// ---------------------------------------------------------------------------
// ASN.1 primitives — built via raw asn1js to avoid needing decorators in
// app tsconfig. Existing api/_utils/tsa.ts uses the same approach for the
// signed-attrs SET re-encoding.
// ---------------------------------------------------------------------------

function makeOidAttribute(attrOid: string, valueOid: string): Attribute {
  const valueDer = new asn1js.ObjectIdentifier({ value: valueOid }).toBER(false);
  return new Attribute({ attrType: attrOid, attrValues: [valueDer] });
}

function makeOctetStringAttribute(attrOid: string, valueBytes: Uint8Array): Attribute {
  // Buffer is a Uint8Array subclass — same code path either way.
  const valueDer = new asn1js.OctetString({ valueHex: toArrayBuffer(valueBytes) }).toBER(false);
  return new Attribute({ attrType: attrOid, attrValues: [valueDer] });
}

function makeUtcTimeAttribute(attrOid: string, when: Date): Attribute {
  // UTCTime accepts dates 1950-2049 (RFC 5280 §4.1.2.5.1). For dates outside
  // that window we should switch to GeneralizedTime; tests use 2026 so
  // UTCTime is fine.
  const utc = new asn1js.UTCTime({ valueDate: when });
  return new Attribute({ attrType: attrOid, attrValues: [utc.toBER(false)] });
}

function makeIssuerAndSerialNumber(keyId: string): IssuerAndSerialNumber {
  // Empty issuer Name (RDNSequence with 0 RDNs) — valid ASN.1, signals
  // "no X.509 cert binding". Tracks the keyId via the serialNumber.
  const emptyNameDer = Uint8Array.from([0x30, 0x00]).buffer;
  const issuer = AsnConvert.parse(emptyNameDer, Name);

  // serialNumber is a positive INTEGER. We use a stable fingerprint of the
  // keyId — verifiers can match a signature to a registered public key by
  // serialNumber. We prepend 0x00 to keep the INTEGER non-negative.
  const fp = createHash("sha256").update(keyId).digest();
  const serial = new Uint8Array(fp.length + 1);
  serial[0] = 0x00;
  serial.set(fp, 1);

  return new IssuerAndSerialNumber({
    issuer,
    serialNumber: serial.buffer.slice(serial.byteOffset, serial.byteOffset + serial.byteLength),
  });
}

function decodeKeyIdFromIasn(iasn: IssuerAndSerialNumber): string {
  const buf = Buffer.from(iasn.serialNumber);
  const trimmed = buf[0] === 0x00 ? buf.subarray(1) : buf;
  return `cms-serial:${trimmed.toString("hex")}`;
}

/**
 * RFC 5652 §5.4 — the bytes the signer signs are the DER encoding of the
 * SignedAttributes as a SET OF Attribute (universal tag 0x31), with the
 * attributes serialised then sorted in ascending lexicographic order before
 * concatenation. (DER requires SET OF elements to be sorted, RFC 5280
 * §4.1.2.7 + X.690 §11.6.)
 *
 * This helper mirrors `encodeSignedAttributes` in api/_utils/tsa.ts so the
 * writer and the existing TSA verifier produce/parse the same bytes.
 */
function encodeSignedAttributesAsSetDer(attrs: Attribute[]): Uint8Array {
  const encoded = attrs
    .map((attr) => Buffer.from(AsnConvert.serialize(attr)))
    .sort(Buffer.compare);
  const inner = Buffer.concat(encoded);
  const lengthBytes = encodeDerLength(inner.length);
  const out = new Uint8Array(1 + lengthBytes.length + inner.length);
  out[0] = 0x31; // universal SET tag, constructed
  out.set(lengthBytes, 1);
  out.set(inner, 1 + lengthBytes.length);
  return out;
}

function encodeDerLength(len: number): Uint8Array {
  if (len < 0x80) return Uint8Array.from([len]);
  const bytes: number[] = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Uint8Array.from([0x80 | bytes.length, ...bytes]);
}

function toArrayBuffer(src: ArrayBuffer | ArrayBufferView | Buffer | Uint8Array): ArrayBuffer {
  if (src instanceof ArrayBuffer) return src;
  return src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) as ArrayBuffer;
}

function readOctetStringAttribute(attrs: Attribute[], oid: string): ArrayBuffer | null {
  const matching = attrs.filter((a) => a.attrType === oid);
  if (matching.length !== 1) return null;
  const attr = matching[0]!;
  if (attr.attrValues.length !== 1) return null;
  try {
    const os = AsnConvert.parse(attr.attrValues[0]!, OctetString);
    return toArrayBuffer(os.buffer);
  } catch {
    return null;
  }
}

function readUtcTimeAttribute(attrs: Attribute[], oid: string): Date | null {
  const matching = attrs.filter((a) => a.attrType === oid);
  if (matching.length !== 1) return null;
  const attr = matching[0]!;
  if (attr.attrValues.length !== 1) return null;
  try {
    const parsed = asn1js.fromBER(attr.attrValues[0]!);
    if (parsed.offset === -1) return null;
    const v = parsed.result;
    if (v instanceof asn1js.UTCTime || v instanceof asn1js.GeneralizedTime) {
      return v.toDate();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract the inner TimeStampToken ContentInfo from a TimeStampResp DER
 * blob. RFC 3161: TimeStampResp ::= SEQUENCE { status PKIStatusInfo,
 * timeStampToken ContentInfo OPTIONAL }. The TimeStampToken is itself a
 * full CMS ContentInfo — what the PAdES SignatureTimeStampToken unsigned
 * attribute expects to carry.
 *
 * If the input already looks like a bare TimeStampToken (ContentInfo with
 * contentType = id-signedData), it is returned unchanged.
 */
export function extractTimeStampTokenDer(tsr: Uint8Array): ArrayBuffer {
  // Try ContentInfo first — bare TimeStampToken passes here.
  try {
    const maybeCi = AsnConvert.parse(toArrayBuffer(tsr), ContentInfo);
    if (maybeCi.contentType === id_signedData) {
      return toArrayBuffer(tsr);
    }
  } catch {
    // fall through
  }

  // Otherwise parse as TimeStampResp and serialise its timeStampToken.
  const resp = AsnConvert.parse(toArrayBuffer(tsr), TimeStampResp);
  if (!resp.timeStampToken) {
    throw new Error("TimeStampResp.timeStampToken missing");
  }
  return AsnConvert.serialize(resp.timeStampToken);
}
