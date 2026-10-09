/**
 * Deterministic TSR fixture builder for sign/* tests.
 *
 * Mirrors the helper in tests/api/_utils/tsa.test.ts so the bytes we sign
 * with the local Ed25519 signer + this TSR pass parseTsr's pin-validation
 * gate. We keep it under src/lib/sign/__fixtures__/ so it lives next to
 * the code under test.
 *
 * Networking: we never hit FreeTSA here. The TSA in this fixture is a
 * test-only EC P-384 key generated per test run.
 */
import { createHash, generateKeyPairSync, sign as nodeSign } from "node:crypto";
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
  CMSVersion,
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

const OID_SHA256 = "2.16.840.1.101.3.4.2.1";
const OID_SHA384 = "2.16.840.1.101.3.4.2.2";
const OID_ECDSA_SHA384 = "1.2.840.10045.4.3.3";
const OID_TST_INFO = "1.2.840.113549.1.9.16.1.4";
const OID_COMMON_NAME = "2.5.4.3";

export type TestTsr = {
  tsr: Buffer;
  parseOptions: { trustedTsaKeyPins: string[]; tsaName: string };
};

export function buildTestTsr(opts: {
  sha256Hex: string;
  genTime: Date;
  status?: PKIStatus;
  signer?: TestSigner;
}): TestTsr {
  const signer = opts.signer ?? createTestSigner();
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

  const unsignedSignerInfo = makeSignerInfo({
    signer,
    signedAttrs,
    signature: Buffer.from([0]),
  });
  const signedAttrsDer = signedAttrsDerForSigning(
    unsignedSignerInfo,
    signer.certificate,
    tstInfoDer,
  );
  const signature = nodeSign("sha384", signedAttrsDer, signer.privateKey);

  const signedData = makeSignedData(
    makeSignerInfo({ signer, signedAttrs, signature }),
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

/**
 * A test TSA with one fixed key, for buildPadesCms's `timestamp` callback:
 * the trust pins are known up front, and each call stamps whatever digest
 * it is handed (the signature value, in the writer).
 */
export function createTestTimestamper(genTime: Date): {
  timestamp: (sha256Hex: string) => Promise<Uint8Array>;
  parseOptions: TestTsr["parseOptions"];
} {
  const signer = createTestSigner();
  return {
    timestamp: async (sha256Hex) => buildTestTsr({ sha256Hex, genTime, signer }).tsr,
    parseOptions: { trustedTsaKeyPins: signer.keyPins, tsaName: "Test TSA" },
  };
}

type TestSigner = {
  privateKey: KeyObject;
  certificate: Certificate;
  issuer: Name;
  serialNumber: ArrayBuffer;
  keyPins: string[];
};

function createTestSigner(): TestSigner {
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
  const signatureValue = nodeSign(
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

function makeSignerInfo(opts: {
  signer: TestSigner;
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

function makeSignedData(
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
  const signedData = makeSignedData(signerInfo, certificate, tstInfoDer);
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

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function toArrayBuffer(src: ArrayBuffer | ArrayBufferView | Buffer): ArrayBuffer {
  if (src instanceof ArrayBuffer) return src;
  return src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) as ArrayBuffer;
}
