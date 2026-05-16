/**
 * Tests for the RFC 3161 / FreeTSA helper.
 *
 * We don't hit the network. Instead we synthesise a valid TSR using the same
 * @peculiar/asn1-tsp schema and exercise parseTsr against it. requestTsr is
 * exercised with a mocked global fetch that returns the same synthetic TSR.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { OctetString, AsnConvert } from "@peculiar/asn1-schema";
import { AlgorithmIdentifier } from "@peculiar/asn1-x509";
import {
  ContentInfo,
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
  id_signedData,
} from "@peculiar/asn1-cms";
import { Name } from "@peculiar/asn1-x509";
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
// Hash of the empty string — handy known value.
const EMPTY_SHA256 = createHash("sha256").update("").digest("hex");

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function buildTsr(opts: { sha256Hex: string; genTime: Date; status?: PKIStatus }): Buffer {
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
  const tstInfoDer = AsnConvert.serialize(tstInfo);

  const signedData = new SignedData({
    version: CMSVersion.v3,
    digestAlgorithms: new DigestAlgorithmIdentifiers([
      new DigestAlgorithmIdentifier({ algorithm: OID_SHA256 }),
    ]),
    encapContentInfo: new EncapsulatedContentInfo({
      eContentType: "1.2.840.113549.1.9.16.1.4",
      eContent: new EncapsulatedContent({ single: new OctetString(tstInfoDer) }),
    }),
    signerInfos: new SignerInfos([
      new SignerInfo({
        version: CMSVersion.v1,
        sid: new SignerIdentifier({
          issuerAndSerialNumber: new IssuerAndSerialNumber({
            issuer: new Name(),
            serialNumber: new Uint8Array([1]).buffer,
          }),
        }),
        digestAlgorithm: new DigestAlgorithmIdentifier({ algorithm: OID_SHA256 }),
        signatureAlgorithm: new SignatureAlgorithmIdentifier({ algorithm: OID_SHA256 }),
        signature: new OctetString(new Uint8Array([0]).buffer),
      }),
    ]),
  });
  const signedDataDer = AsnConvert.serialize(signedData);

  const token = new TimeStampToken({ contentType: id_signedData, content: signedDataDer });
  const resp = new TimeStampResp({
    status: new PKIStatusInfo({ status: opts.status ?? PKIStatus.granted }),
    timeStampToken: token,
  });
  return Buffer.from(AsnConvert.serialize(resp));
}

const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("parseTsr", () => {
  it("extracts hash + signed time from a valid TSR", () => {
    const genTime = new Date("2026-05-16T10:30:00.000Z");
    const tsr = buildTsr({ sha256Hex: EMPTY_SHA256, genTime });

    const result = parseTsr(tsr);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sha256Hex).toBe(EMPTY_SHA256);
    expect(result.signedAtUtc.toISOString()).toBe(genTime.toISOString());
    expect(result.tsaName).toBe("FreeTSA");
  });

  it("returns ok:false for corrupted bytes", () => {
    const result = parseTsr(Buffer.from([0x30, 0x00, 0xff, 0xff]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/parse failed|missing|tst/i);
  });

  it("returns ok:false when the TSA rejected the request", () => {
    const tsr = buildTsr({
      sha256Hex: EMPTY_SHA256,
      genTime: new Date(),
      status: PKIStatus.rejection,
    });
    const result = parseTsr(tsr);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/rejected|status=2/i);
  });
});

describe("requestTsr", () => {
  beforeEach(() => {
    // Default — overridden per test.
    global.fetch = vi.fn();
  });

  it("returns the TSR buffer when FreeTSA responds with a matching valid TSR", async () => {
    const genTime = new Date("2026-05-16T11:00:00.000Z");
    const tsr = buildTsr({ sha256Hex: EMPTY_SHA256, genTime });
    global.fetch = vi.fn().mockResolvedValue(
      new Response(new Uint8Array(tsr), { status: 200 }),
    );

    const result = await requestTsr(EMPTY_SHA256);
    expect(result).not.toBeNull();
    expect(Buffer.isBuffer(result) || result instanceof Buffer).toBe(true);
    const parsed = parseTsr(result!);
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
    const tsr = buildTsr({ sha256Hex: otherHash, genTime: new Date() });
    global.fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array(tsr), { status: 200 }));

    const result = await requestTsr(EMPTY_SHA256);
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
