/** Offline Node verifier. Trust is supplied out-of-band, never by the ZIP. */
import { createHash, timingSafeEqual } from "node:crypto";
import { crc32, inflateRawSync } from "node:zlib";
import JSZip from "jszip";
import { verifyPadesCms } from "../sign/verify.js";
import { parsePadesCms } from "../sign/pades.js";
import {
  decodeBase64, isSafePackPath, MAX_MANIFEST_BYTES, PACK_CONTROL_FILES, parsePackManifest, type PackManifest,
} from "./pack-integrity.js";

export type VerifiedPack = {
  manifest: PackManifest;
  signature: "verified" | "unsigned";
  publicKeyFingerprint: string | null;
  timestamp: "none";
};
const MAX_ZIP_BYTES = 25 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function verifyExportPack(
  zipBytes: Uint8Array,
  options: { trustedPublicKey?: Uint8Array; allowUnsigned?: boolean } = {},
): Promise<VerifiedPack> {
  if (!zipBytes.byteLength || zipBytes.byteLength > MAX_ZIP_BYTES) throw new Error("Invalid pack size");
  const records = validateZipStructure(zipBytes);
  const recordByName = new Map(records.map(record => [record.name, record]));
  const zip = await JSZip.loadAsync(zipBytes, { checkCRC32: false, createFolders: false });
  // JSZip replaces duplicate names while loading. Compare to the directory's
  // original count so two readers cannot choose different duplicate payloads.
  if (Object.keys(zip.files).length !== records.length) throw new Error("Duplicate or ambiguous ZIP entries");
  const allEntries = Object.values(zip.files);
  if (allEntries.some(entry => {
    const mode = typeof entry.unixPermissions === "string" ? parseInt(entry.unixPermissions, 8) : entry.unixPermissions ?? 0;
    const record = recordByName.get(entry.name);
    return !record || record.directory !== entry.dir || !isSafePackPath(entry.dir ? entry.name.replace(/\/$/, "") : entry.name) ||
      (entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name) ||
      ((mode & 0o170000) !== 0 && (mode & 0o170000) !== (entry.dir ? 0o040000 : 0o100000));
  })) throw new Error("Unsafe or non-regular ZIP entry");
  const entries = allEntries.filter(entry => !entry.dir);
  if (entries.length > 515) throw new Error("Too many pack files");
  const names = entries.map(entry => entry.name);
  if (new Set(names.map(name => name.toLowerCase())).size !== names.length || entries.some(entry =>
    !isSafePackPath(entry.name) || (entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name))) {
    throw new Error("Unsafe or ambiguous pack paths");
  }
  // JSZip/Pako ignores trailing bytes after a DEFLATE end marker. Use Node's
  // bounded inflater and consumed-input count, not just its decoded payload:
  // otherwise a hidden local record could be swallowed by a forged ZIP size.
  const read = async (path: string, max: number) => {
    const record = recordByName.get(path);
    if (!record || record.directory || !zip.file(path)) throw new Error(`Missing pack file: ${path}`);
    if (record.uncompressedSize > max) throw new Error(`Pack file exceeds expected size: ${path}`);
    const compressed = zipBytes.subarray(record.data, record.data + record.compressedSize);
    let decoded: Uint8Array = compressed;
    if (record.method === 8) {
      // Node's info:true return shape is documented but absent from the
      // installed @types/node convenience-method overload.
      const inflated = inflateRawSync(compressed, { info: true, maxOutputLength: Math.max(1, max) }) as unknown as {
        buffer: Uint8Array; engine: { bytesWritten: number };
      };
      if (inflated.engine.bytesWritten !== compressed.length) throw new Error("Unconsumed ZIP compressed data");
      decoded = inflated.buffer;
    }
    if (decoded.length > max || decoded.length !== record.uncompressedSize || crc32(decoded) !== record.crc) {
      throw new Error(`ZIP payload size or CRC mismatch: ${path}`);
    }
    return decoded;
  };
  const manifestBytes = await read("manifest.json", MAX_MANIFEST_BYTES);
  const manifest = parsePackManifest(manifestBytes);
  const expected = new Set([...manifest.files.map(file => file.path), ...PACK_CONTROL_FILES]);
  if (names.some(name => !expected.has(name))) throw new Error("Unexpected unlisted file in pack");
  if (manifest.files.reduce((sum, file) => sum + file.bytes, 0) > MAX_UNCOMPRESSED_BYTES) throw new Error("Pack is too large to verify");
  for (const file of manifest.files) {
    const bytes = await read(file.path, file.bytes);
    if (bytes.byteLength !== file.bytes || hash(bytes) !== file.sha256) throw new Error(`Pack file changed: ${file.path}`);
  }
  const descriptor = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await read("signature.json", 20_000)));
  if (descriptor?.status === "unsigned") {
    if (zip.file("manifest.sig")) throw new Error("Unsigned pack unexpectedly contains a signature");
    if (!["not_configured", "local_only"].includes(descriptor.reason)) throw new Error("Invalid unsigned pack status");
    if (!options.allowUnsigned) throw new Error("This pack is unsigned. Its origin cannot be verified.");
    return { manifest, signature: "unsigned", publicKeyFingerprint: null, timestamp: "none" };
  }
  if (descriptor?.status !== "signed" || descriptor.algorithm !== "Ed25519" || descriptor.timestamp !== "none" ||
      typeof descriptor.public_key_b64 !== "string" || typeof descriptor.key_id !== "string" ||
      typeof descriptor.signed_at !== "string" || descriptor.content_sha256 !== hash(manifestBytes)) {
    throw new Error("Invalid signature descriptor");
  }
  if (!options.trustedPublicKey || options.trustedPublicKey.byteLength !== 32) {
    throw new Error("An independently trusted Ed25519 public key is required. The bundled key is not a trust anchor.");
  }
  const publicKey = decodeBase64(descriptor.public_key_b64);
  if (publicKey.byteLength !== 32 || !timingSafeEqual(publicKey, options.trustedPublicKey) ||
      descriptor.public_key_sha256 !== hash(options.trustedPublicKey)) throw new Error("The pack uses a different signing key");
  const cms = await read("manifest.sig", MAX_MANIFEST_BYTES + 20_000);
  const result = await verifyPadesCms({ cms, expectedContent: manifestBytes, expectedPublicKey: options.trustedPublicKey, requireTimestamp: false });
  if (!result.ok) throw new Error(`Signature verification failed: ${result.reason}`);
  // The descriptor is convenience data, not signed itself. Check every claimed
  // property against the CMS before returning it as verified information.
  const parsed = parsePadesCms(cms);
  if (parsed.timestampToken || parsed.keyId !== `cms-serial:${hash(new TextEncoder().encode(descriptor.key_id))}` ||
      !parsed.signingTime || Math.floor(Date.parse(descriptor.signed_at) / 1000) !== Math.floor(parsed.signingTime.getTime() / 1000)) {
    throw new Error("Signature details do not match the signed attributes");
  }
  return { manifest, signature: "verified", publicKeyFingerprint: hash(options.trustedPublicKey), timestamp: "none" };
}

type ZipRecord = {
  name: string; directory: boolean; local: number; data: number;
  compressedSize: number; uncompressedSize: number; crc: number; method: number; flags: number;
};

/** No ZIP64, encryption, archive prefixes or arbitrary extensions are needed
 * for our bounded format. Every byte before the directory must belong to one
 * referenced local header, its exact payload, or its checked data descriptor. */
function validateZipStructure(bytes: Uint8Array): ZipRecord[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65_557); at--) {
    if (view.getUint32(at, true) === 0x06054b50 && at + 22 + view.getUint16(at + 20, true) === bytes.length) {
      end = at; break;
    }
  }
  if (end < 0) throw new Error("Invalid ZIP directory");
  const count = view.getUint16(end + 10, true);
  const directoryStart = view.getUint32(end + 16, true);
  let offset = directoryStart;
  const directoryEnd = directoryStart + view.getUint32(end + 12, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count ||
      !count || count > 1_030 || directoryEnd !== end) throw new Error("Unsupported ZIP structure");
  const names = new Set<string>();
  const records: ZipRecord[] = [];
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  for (let i = 0; i < count; i++) {
    if (offset + 46 > directoryEnd || view.getUint32(offset, true) !== 0x02014b50) throw new Error("Invalid ZIP entry");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    // Only DEFLATE option bits, data descriptors and UTF-8 names are supported.
    if (flags & ~0x080e || ![0, 8].includes(method) || (method === 0 && flags & 6) || view.getUint16(offset + 34, true) ||
        ![10, 20].includes(view.getUint16(offset + 6, true)) || !nameLength ||
        compressedSize > MAX_ZIP_BYTES || uncompressedSize > MAX_UNCOMPRESSED_BYTES ||
        offset + 46 + nameLength + extraLength + commentLength > directoryEnd || local + 30 > directoryStart ||
        view.getUint32(local, true) !== 0x04034b50 || view.getUint16(local + 26, true) !== nameLength ||
        view.getUint16(local + 4, true) !== view.getUint16(offset + 6, true) ||
        view.getUint16(local + 6, true) !== flags || view.getUint16(local + 8, true) !== method ||
        view.getUint32(local + 10, true) !== view.getUint32(offset + 12, true)) throw new Error("Unsupported ZIP entry");
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    const localName = bytes.subarray(local + 30, local + 30 + nameLength);
    const localExtraLength = view.getUint16(local + 28, true);
    const data = local + 30 + nameLength + localExtraLength;
    if (data + compressedSize > directoryStart) throw new Error("Invalid ZIP payload bounds");
    const localExtra = bytes.subarray(local + 30 + nameLength, local + 30 + nameLength + localExtraLength);
    const extra = bytes.subarray(offset + 46 + nameLength, offset + 46 + nameLength + extraLength);
    const name = decoder.decode(nameBytes);
    const directory = name.endsWith("/");
    const key = (directory ? name.slice(0, -1) : name).toLowerCase();
    if (names.has(key) || !Buffer.from(nameBytes).equals(localName) || !Buffer.from(extra).equals(localExtra)) {
      throw new Error("Duplicate or ambiguous ZIP entries");
    }
    const comment = bytes.subarray(offset + 46 + nameLength + extraLength, offset + 46 + nameLength + extraLength + commentLength);
    validateZipExtra(extra, nameBytes, comment);
    if (Boolean(view.getUint32(offset + 38, true) & 0x10) !== directory ||
        (directory && (compressedSize || uncompressedSize || crc || method !== 0)) ||
        (method === 0 && compressedSize !== uncompressedSize)) throw new Error("Inconsistent ZIP directory or stored payload");
    const localCrc = view.getUint32(local + 14, true);
    const localCompressed = view.getUint32(local + 18, true);
    const localUncompressed = view.getUint32(local + 22, true);
    const deferred = flags & 8 && localCrc === 0 && localCompressed === 0 && localUncompressed === 0;
    if (!deferred && (localCrc !== crc || localCompressed !== compressedSize || localUncompressed !== uncompressedSize)) {
      throw new Error("Inconsistent ZIP local payload metadata");
    }
    names.add(key);
    records.push({ name, directory, local, data, compressedSize, uncompressedSize, crc, method, flags });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== directoryEnd) throw new Error("Invalid ZIP directory length");
  records.sort((a, b) => a.local - b.local);
  let covered = 0;
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.local !== covered) throw new Error("Unclaimed or overlapping ZIP local records");
    covered = record.data + record.compressedSize;
    const next = records[i + 1]?.local ?? directoryStart;
    if (record.flags & 8) {
      // Both classic 12-byte and signed 16-byte descriptors are legal. Use the
      // exact next-record boundary so a CRC equal to the signature is unambiguous.
      const length = next - covered;
      const metadata = length === 16 && view.getUint32(covered, true) === 0x08074b50 ? covered + 4 : covered;
      if (![12, 16].includes(length) || (length === 16 && metadata === covered) ||
          view.getUint32(metadata, true) !== record.crc ||
          view.getUint32(metadata + 4, true) !== record.compressedSize ||
          view.getUint32(metadata + 8, true) !== record.uncompressedSize) throw new Error("Invalid ZIP data descriptor");
      covered = next;
    }
  }
  if (covered !== directoryStart) throw new Error("Unclaimed or overlapping ZIP local records");
  return records;
}

/** JSZip emits only Unicode-name/comment extras. Require these copies to agree
 * with the header bytes; reject ZIP64, duplicate, malformed or unknown extras
 * rather than letting another extractor reinterpret sizes, paths or file type. */
function validateZipExtra(extra: Uint8Array, name: Uint8Array, comment: Uint8Array): void {
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
  const seen = new Set<number>();
  for (let at = 0; at < extra.length;) {
    if (at + 4 > extra.length) throw new Error("Malformed ZIP extra field");
    const id = view.getUint16(at, true), length = view.getUint16(at + 2, true);
    if (![0x7075, 0x6375].includes(id) || seen.has(id) || length < 5 || at + 4 + length > extra.length) {
      throw new Error("Unsupported ZIP extra field");
    }
    const original = id === 0x7075 ? name : comment;
    if (extra[at + 4] !== 1 || view.getUint32(at + 5, true) !== crc32(original) ||
        !Buffer.from(extra.subarray(at + 9, at + 4 + length)).equals(original)) throw new Error("Ambiguous ZIP Unicode metadata");
    seen.add(id); at += 4 + length;
  }
}
