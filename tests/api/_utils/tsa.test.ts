/**
 * Tests for the RFC 3161 / FreeTSA helper.
 *
 * We don't hit the network. Instead we synthesise a valid TSR using the same
 * @peculiar/asn1-tsp schema and exercise parseTsr against it. requestTsr is
 * exercised with a mocked global fetch that returns the same synthetic TSR.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import type { KeyObject } from "node:crypto";
import * as asn1js from "asn1js";
import { OctetString, AsnConvert } from "@peculiar/asn1-schema";
import {
  AlgorithmIdentifier,
  AttributeTypeAndValue,
  AttributeValue,
  Certificate,
  Name,
  RelativeDistinguishedName,
  SubjectPublicKeyInfo,
  TBSCertificate,
  Validity,
  Version,
} from "@peculiar/asn1-x509";
import {
  Attribute,
  CertificateChoices,
  CertificateSet,
  EncapsulatedContent,
  EncapsulatedContentInfo,
  SignedData,
  SignerInfo,
  SignerInfos,
  CMSVersion,
  DigestAlgorithmIdentifier,
  DigestAlgorithmIdentifiers,
  SignatureAlgorithmIdentifier,
  SignerIdentifier,
  IssuerAndSerialNumber,
  id_contentType,
  id_messageDigest,
  id_signedData,
} from "@peculiar/asn1-cms";
import {
  MessageImprint,
  PKIStatus,
  PKIStatusInfo,
  TimeStampResp,
  TimeStampToken,
  TSTInfo,
  TSTInfoVersion,
} from "@peculiar/asn1-tsp";

import { parseTsr, requestTsr } from "../../../api/_utils/tsa.js";

const OID_SHA256 = "2.16.840.1.101.3.4.2.1";
const OID_SHA384 = "2.16.840.1.101.3.4.2.2";
const OID_ECDSA_SHA384 = "1.2.840.10045.4.3.3";
const OID_TST_INFO = "1.2.840.113549.1.9.16.1.4";
const OID_COMMON_NAME = "2.5.4.3";
// Hash of the empty string — handy known value.
const EMPTY_SHA256 = createHash("sha256").update("").digest("hex");

type TestTsr = {
  tsr: Buffer;
  parseOptions: { trustedTsaKeyPins: string[]; tsaName: string };
};

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function buildTsr(opts: { sha256Hex: string; genTime: Date; status?: PKIStatus }): TestTsr {
  const signer = createTestSigner();
  const tstInfo = new TSTInfo({
    version: TSTInfoVersion.v1,
    policy: "1.2.3.4.5",
    messageImprint: new MessageImprint({
      hashAlgorithm: new AlgorithmIdentifier({ algorithm: OID_SHA256 }),
      hashedMessage: new OctetString(hexToBytes(opts.sha256Hex).buffer.slice(0)),
    }),
    serialNumber: new Uint8Array([1, 2, 3, 4]).buffer,
    genTime: opts.genTime,
    ordering: false,
  });
  const tstInfoDer = Buffer.from(AsnConvert.serialize(tstInfo));
  const messageDigest = createHash("sha384").update(tstInfoDer).digest();

  const signedAttrs = [
    new Attribute({
      attrType: id_contentType,
      attrValues: [new asn1js.ObjectIdentifier({ value: OID_TST_INFO }).toBER(false)],
    }),
    new Attribute({
      attrType: id_messageDigest,
      attrValues: [AsnConvert.serialize(new OctetString(toArrayBuffer(messageDigest)))],
    }),
  ];

  const unsignedSignerInfo = buildSignerInfo({
    signer,
    signedAttrs,
    signature: Buffer.from([0]),
  });
  const signedAttrsDer = signedAttrsDerForSigning(
    unsignedSignerInfo,
    signer.certificate,
    tstInfoDer,
  );
  const signature = sign("sha384", signedAttrsDer, signer.privateKey);

  const signedData = buildSignedData(
    buildSignerInfo({ signer, signedAttrs, signature }),
    signer.certificate,
    tstInfoDer,
  );
  const signedDataDer = AsnConvert.serialize(signedData);

  const token = new TimeStampToken({ contentType: id_signedData, content: signedDataDer });
  const resp = new TimeStampResp({
    status: new PKIStatusInfo({ status: opts.status ?? PKIStatus.granted }),
    timeStampToken: token,
  });
  return {
    tsr: Buffer.from(AsnConvert.serialize(resp)),
    parseOptions: {
      trustedTsaKeyPins: signer.keyPins,
      tsaName: "Test TSA",
    },
  };
}

function createTestSigner(): {
  privateKey: KeyObject;
  certificate: Certificate;
  issuer: Name;
  serialNumber: ArrayBuffer;
  keyPins: string[];
} {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-384" });
  const spkiDer = publicKey.export({ format: "der", type: "spki" });
  const spki = AsnConvert.parse(toArrayBuffer(spkiDer), SubjectPublicKeyInfo);
  const issuer = new Name([
    new RelativeDistinguishedName([
      new AttributeTypeAndValue({
        type: OID_COMMON_NAME,
        value: new AttributeValue({ utf8String: "Test TSA" }),
      }),
    ]),
  ]);
  const serialNumber = new Uint8Array([1]).buffer;
  const signatureAlgorithm = new AlgorithmIdentifier({ algorithm: OID_ECDSA_SHA384 });
  const tbsCertificate = new TBSCertificate({
    version: Version.v3,
    serialNumber,
    signature: signatureAlgorithm,
    issuer,
    validity: new Validity({
      notBefore: new Date("2026-01-01T00:00:00.000Z"),
      notAfter: new Date("2027-01-01T00:00:00.000Z"),
    }),
    subject: issuer,
    subjectPublicKeyInfo: spki,
  });
  const signatureValue = sign(
    "sha384",
    Buffer.from(AsnConvert.serialize(tbsCertificate)),
    privateKey,
  );

  const certificate = new Certificate({
    tbsCertificate,
    signatureAlgorithm,
    signatureValue: toArrayBuffer(signatureValue),
  });

  return {
    privateKey,
    certificate,
    issuer,
    serialNumber,
    keyPins: [
      createHash("sha256").update(Buffer.from(AsnConvert.serialize(certificate))).digest("hex"),
      createHash("sha256").update(Buffer.from(toArrayBuffer(spki.subjectPublicKey))).digest("hex"),
      createHash("sha256").update(Buffer.from(toArrayBuffer(spkiDer))).digest("hex"),
    ],
  };
}

function buildSignerInfo(opts: {
  signer: ReturnType<typeof createTestSigner>;
  signedAttrs: Attribute[];
  signature: Buffer;
}): SignerInfo {
  return new SignerInfo({
    version: CMSVersion.v1,
    sid: new SignerIdentifier({
      issuerAndSerialNumber: new IssuerAndSerialNumber({
        issuer: opts.signer.issuer,
        serialNumber: opts.signer.serialNumber,
      }),
    }),
    digestAlgorithm: new DigestAlgorithmIdentifier({ algorithm: OID_SHA384 }),
    signedAttrs: opts.signedAttrs,
    signatureAlgorithm: new SignatureAlgorithmIdentifier({ algorithm: OID_ECDSA_SHA384 }),
    signature: new OctetString(toArrayBuffer(opts.signature)),
  });
}

function buildSignedData(
  signerInfo: SignerInfo,
  certificate: Certificate,
  tstInfoDer: Buffer,
): SignedData {
  return new SignedData({
    version: CMSVersion.v3,
    digestAlgorithms: new DigestAlgorithmIdentifiers([
      new DigestAlgorithmIdentifier({ algorithm: OID_SHA384 }),
    ]),
    encapContentInfo: new EncapsulatedContentInfo({
      eContentType: OID_TST_INFO,
      eContent: new EncapsulatedContent({ single: new OctetString(toArrayBuffer(tstInfoDer)) }),
    }),
    certificates: new CertificateSet([new CertificateChoices({ certificate })]),
    signerInfos: new SignerInfos([signerInfo]),
  });
}

function signedAttrsDerForSigning(
  signerInfo: SignerInfo,
  certificate: Certificate,
  tstInfoDer: Buffer,
): Buffer {
  const signedData = buildSignedData(signerInfo, certificate, tstInfoDer);
  const reparsed = AsnConvert.parse(AsnConvert.serialize(signedData), SignedData);
  const attrs = reparsed.signerInfos[0]?.signedAttrs;
  if (!attrs?.length) throw new Error("signed attrs were not encoded");
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

function toArrayBuffer(src: ArrayBuffer | ArrayBufferView | Buffer): ArrayBuffer {
  if (src instanceof ArrayBuffer) return src;
  return src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) as ArrayBuffer;
}

const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("parseTsr", () => {
  it("extracts hash + signed time from a valid TSR", () => {
    const genTime = new Date("2026-05-16T10:30:00.000Z");
    const { tsr, parseOptions } = buildTsr({ sha256Hex: EMPTY_SHA256, genTime });

    const result = parseTsr(tsr, parseOptions);
    if (!result.ok) throw new Error(result.reason);
    expect(result.sha256Hex).toBe(EMPTY_SHA256);
    expect(result.signedAtUtc.toISOString()).toBe(genTime.toISOString());
    expect(result.tsaName).toBe("Test TSA");
  });

  it("returns ok:false for corrupted bytes", () => {
    const result = parseTsr(Buffer.from([0x30, 0x00, 0xff, 0xff]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/parse failed|missing|tst/i);
  });

  it("returns ok:false when the TSA rejected the request", () => {
    const { tsr, parseOptions } = buildTsr({
      sha256Hex: EMPTY_SHA256,
      genTime: new Date(),
      status: PKIStatus.rejection,
    });
    const result = parseTsr(tsr, parseOptions);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/rejected|status=2/i);
  });

  it("returns ok:false when the TSR signature is tampered", () => {
    const { tsr, parseOptions } = buildTsr({
      sha256Hex: EMPTY_SHA256,
      genTime: new Date("2026-05-16T10:45:00.000Z"),
    });
    const tampered = Buffer.from(tsr);
    tampered[tampered.length - 1] ^= 0x01;

    const result = parseTsr(tampered, parseOptions);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid_signature");
  });
});

describe("requestTsr", () => {
  beforeEach(() => {
    // Default — overridden per test.
    global.fetch = vi.fn();
  });

  it("returns the TSR buffer when FreeTSA responds with a matching valid TSR", async () => {
    const genTime = new Date("2026-05-16T11:00:00.000Z");
    const { tsr, parseOptions } = buildTsr({ sha256Hex: EMPTY_SHA256, genTime });
    global.fetch = vi.fn().mockResolvedValue(
      new Response(new Uint8Array(tsr), { status: 200 }),
    );

    const result = await requestTsr(EMPTY_SHA256, parseOptions);
    expect(result).not.toBeNull();
    expect(Buffer.isBuffer(result) || result instanceof Buffer).toBe(true);
    const parsed = parseTsr(result!, parseOptions);
    expect(parsed.ok).toBe(true);
  });

  it("returns null when FreeTSA returns non-2xx", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("nope", { status: 502 }));
    const result = await requestTsr(EMPTY_SHA256);
    expect(result).toBeNull();
  });

  it("returns null when fetch throws (network down / aborted)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await requestTsr(EMPTY_SHA256);
    expect(result).toBeNull();
  });

  it("returns null when FreeTSA returns a TSR for a different hash", async () => {
    // Server signs the wrong hash — must be rejected so we don't claim a
    // mismatched timestamp is valid.
    const otherHash = createHash("sha256").update("other").digest("hex");
    const { tsr, parseOptions } = buildTsr({ sha256Hex: otherHash, genTime: new Date() });
    global.fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array(tsr), { status: 200 }));

    const result = await requestTsr(EMPTY_SHA256, parseOptions);
    expect(result).toBeNull();
  });

  it("rejects an invalid hex hash without making a network request", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const result = await requestTsr("not-a-hash");
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
