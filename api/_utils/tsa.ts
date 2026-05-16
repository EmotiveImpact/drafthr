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

import { OctetString, AsnConvert } from "@peculiar/asn1-schema";
import { AlgorithmIdentifier } from "@peculiar/asn1-x509";
import { SignedData, id_signedData } from "@peculiar/asn1-cms";
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
const FREETSA_URL = "https://freetsa.org/tsr";
const FREETSA_TIMEOUT_MS = 10_000;

export type TsrParseOk = {
  ok: true;
  sha256Hex: string;
  signedAtUtc: Date;
  tsaName: string;
};

export type TsrParseFail = { ok: false; reason: string };

/**
 * Request a trusted RFC 3161 timestamp from FreeTSA for a SHA-256 hash.
 * Returns the binary TSR (TimeStampResponse) or null on any failure —
 * caller continues without it (audit event marks tsa: unavailable).
 */
export async function requestTsr(sha256Hex: string): Promise<Buffer | null> {
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
    const parsed = parseTsr(buf);
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
 * Note: this does NOT verify FreeTSA's CMS signature. Signature verification
 * requires the FreeTSA root cert chain and is left to the verify endpoint
 * (or external tooling like openssl ts -verify) — extracting the signed
 * imprint + time is enough to confirm shape + that the hash matches.
 */
export function parseTsr(tsr: Buffer | Uint8Array): TsrParseOk | TsrParseFail {
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
  const sha256Hex = bytesToHex(new Uint8Array(toArrayBuffer(imprint.hashedMessage.buffer)));

  // FreeTSA's identity isn't carried in TSTInfo unless tsa is set; default to
  // "FreeTSA" as the provider tag. Tighter identity-binding is a future
  // enhancement (parse signer cert subject CN).
  return {
    ok: true,
    sha256Hex,
    signedAtUtc: tst.genTime,
    tsaName: "FreeTSA",
  };
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

function toArrayBuffer(src: ArrayBuffer | ArrayBufferView | Buffer): ArrayBuffer {
  if (src instanceof ArrayBuffer) return src;
  // Slice to detach from the underlying pool (Node Buffer shares memory).
  return src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) as ArrayBuffer;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
