// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import JSZip from "jszip";
import { createLocalSigner } from "../sign/local-signer";
import { buildPadesCms } from "../sign/pades";
import { decodeBase64, encodeBase64, encodePackManifest, PACK_FORMAT, parsePackManifest, requestPackSignature, sha256Hex, type PackManifest } from "./pack-integrity";
import { verifyExportPack } from "./verify-pack";

const draftId = "a358bb74-6202-4bf5-b76e-04cf982b3e82";
const workspaceId = "ce2c0080-d1c6-47ec-a3dd-6f0cf74b2d68";
const now = "2026-10-03T10:00:00.000Z";
const text = new TextEncoder();
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
async function fixture(signed = true, payloadPath = "letter.pdf", pdf = text.encode("exact PDF bytes")) {
  const zip = new JSZip();
  zip.file(payloadPath, pdf);
  const manifest: PackManifest = {
    format: PACK_FORMAT, hashAlgorithm: "SHA-256", draftId, workspaceId, draftRevision: 7,
    generatedAt: now, metadata: { letterType: "offer", employee: { legalName: "Fictional test" } },
    files: [{ path: payloadPath, bytes: pdf.length, sha256: sha(pdf) }],
  };
  const bytes = encodePackManifest(manifest);
  zip.file("manifest.json", bytes);
  const signer = createLocalSigner();
  const publicKey = await signer.publicKey();
  if (signed) {
    const built = await buildPadesCms({ content: bytes, signer, signingTime: new Date(now) });
    zip.file("manifest.sig", built.cmsDer);
    zip.file("signature.json", JSON.stringify({ status: "signed", algorithm: "Ed25519", timestamp: "none",
      key_id: signer.keyId, public_key_b64: encodeBase64(publicKey), public_key_sha256: sha(publicKey),
      content_sha256: built.contentSha256Hex, signed_at: now }));
  } else zip.file("signature.json", JSON.stringify({ status: "unsigned", reason: "not_configured" }));
  return { zip, manifest, bytes, publicKey, output: () => zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }) };
}

/** Fixture editing only: JSZip produces the valid records, then these helpers
 * preserve all directory offsets while introducing a specific malformed view. */
function fixtureLayout(bytes: Buffer) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const directory = bytes.readUInt32LE(end + 16);
  const records: { central: number; local: number; data: number; size: number; name: string }[] = [];
  let central = directory;
  for (let i = 0; i < bytes.readUInt16LE(end + 10); i++) {
    const local = bytes.readUInt32LE(central + 42);
    const length = bytes.readUInt16LE(central + 28);
    records.push({ central, local, size: bytes.readUInt32LE(central + 20),
      name: bytes.subarray(central + 46, central + 46 + length).toString("utf8"),
      data: local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28) });
    central += 46 + length + bytes.readUInt16LE(central + 30) + bytes.readUInt16LE(central + 32);
  }
  return { end, directory, records };
}
function spliceFixture(bytes: Buffer, at: number, remove: number, insert: Uint8Array) {
  const { end, directory, records } = fixtureLayout(bytes);
  const delta = insert.length - remove;
  const changed = Buffer.concat([bytes.subarray(0, at), insert, bytes.subarray(at + remove)]);
  changed.writeUInt32LE(directory + delta, end + delta + 16);
  for (const entry of records) changed.writeUInt32LE(entry.local >= at ? entry.local + delta : entry.local, entry.central + delta + 42);
  return changed;
}
async function hiddenLocalRecord() {
  const zip = new JSZip();
  zip.file("notes.txt", "Harmless but unsigned notes.");
  const bytes = Buffer.from(await zip.generateAsync({ type: "uint8array", compression: "STORE" }));
  return bytes.subarray(0, fixtureLayout(bytes).directory);
}

afterEach(() => vi.unstubAllGlobals());
describe("canonical pack manifests", () => {
  it("canonically round trips nested metadata and uses SHA-256 on exact bytes", async () => {
    const f = await fixture();
    expect(parsePackManifest(f.bytes)).toEqual(f.manifest);
    const reversed = { ...f.manifest, metadata: { employee: { legalName: "Fictional test" }, letterType: "offer" } };
    expect(encodePackManifest(reversed)).toEqual(f.bytes);
    expect(await sha256Hex(f.bytes)).toBe(sha(f.bytes));
  });
  it("rejects whitespace and invalid base64 instead of signing normalized bytes", async () => {
    const f = await fixture();
    expect(() => parsePackManifest(text.encode(JSON.stringify(f.manifest, null, 2)))).toThrow("canonical JSON");
    expect(() => parsePackManifest(Uint8Array.from([0xef, 0xbb, 0xbf, ...f.bytes]))).toThrow();
    for (const bad of ["a", "a===", "YQ==\n", "Yf==", "../"]) expect(() => decodeBase64(bad)).toThrow();
  });
  it("rejects duplicate, reserved and traversal paths", async () => {
    const f = await fixture();
    for (const path of ["../secret", "a/../b", "a\\b", "manifest.sig", "Manifest.json", "manifest.json/a", "C:/a", "a.", "CON.txt"]) {
      expect(() => encodePackManifest({ ...f.manifest, files: [{ ...f.manifest.files[0], path }] })).toThrow();
    }
    expect(() => encodePackManifest({ ...f.manifest, files: [...f.manifest.files, ...f.manifest.files] })).toThrow();
    expect(() => encodePackManifest({ ...f.manifest, files: [f.manifest.files[0], { ...f.manifest.files[0], path: "letter.pdf/child" }] })).toThrow();
  });
});

describe("offline pack verification", () => {
  it("verifies a persisted and reopened ZIP against an independently trusted key", async () => {
    const f = await fixture();
    const serialized = await f.output();
    const reopened = new Uint8Array(Buffer.from(serialized));
    const result = await verifyExportPack(reopened, { trustedPublicKey: f.publicKey });
    expect(result).toMatchObject({ signature: "verified", publicKeyFingerprint: sha(f.publicKey), timestamp: "none",
      manifest: { draftId, workspaceId, draftRevision: 7 } });
  });
  it("runs the documented offline CLI against an actual ZIP and independently supplied key file", async () => {
    const f = await fixture();
    const directory = await mkdtemp(join(tmpdir(), "drafthr-verify-pack-"));
    try {
      await writeFile(join(directory, "pack.zip"), await f.output());
      await writeFile(join(directory, "trusted-key.b64"), encodeBase64(f.publicKey));
      const result = await promisify(execFile)(process.execPath, ["--import", "tsx", "src/lib/export/verify-pack-cli.ts",
        join(directory, "pack.zip"), join(directory, "trusted-key.b64")], { cwd: process.cwd(), timeout: 10_000 });
      expect(JSON.parse(result.stdout)).toMatchObject({ signature: "verified", trustedTimestamp: false,
        filesChecked: 1, publicKeyFingerprint: sha(f.publicKey) });
    } finally {
      await rm(directory, { recursive: true, force: true }); // Only this test's mkdtemp fixture directory.
    }
  });
  it.each(["changed", "missing", "additional"])("rejects %s payload files", async change => {
    const f = await fixture();
    if (change === "changed") f.zip.file("letter.pdf", "forged document!");
    if (change === "missing") f.zip.remove("letter.pdf");
    if (change === "additional") f.zip.file("unlisted.txt", "not covered by manifest");
    await expect(verifyExportPack(await f.output(), { trustedPublicKey: f.publicKey })).rejects.toThrow(/changed|Missing|Unexpected|exceeds expected size/);
  });
  it("rejects a rewritten manifest even when its file hashes are internally consistent", async () => {
    const f = await fixture();
    const forged = text.encode("different pdf");
    f.zip.file("letter.pdf", forged);
    const bytes = encodePackManifest({ ...f.manifest, files: [{ path: "letter.pdf", bytes: forged.length, sha256: sha(forged) }] });
    f.zip.file("manifest.json", bytes);
    const descriptor = JSON.parse(await f.zip.file("signature.json")!.async("string"));
    f.zip.file("signature.json", JSON.stringify({ ...descriptor, content_sha256: sha(bytes) }));
    await expect(verifyExportPack(await f.output(), { trustedPublicKey: f.publicKey })).rejects.toThrow("byte_range_tampered");
  });
  it("does not trust a public key supplied only by the archive", async () => {
    const f = await fixture();
    await expect(verifyExportPack(await f.output())).rejects.toThrow("independently trusted");
    const wrong = await createLocalSigner().publicKey();
    await expect(verifyExportPack(await f.output(), { trustedPublicKey: wrong })).rejects.toThrow("different signing key");
  });
  it("rejects a missing or damaged signature and forged key metadata", async () => {
    const f = await fixture();
    const original = await f.zip.file("manifest.sig")!.async("uint8array");
    f.zip.remove("manifest.sig");
    await expect(verifyExportPack(await f.output(), { trustedPublicKey: f.publicKey })).rejects.toThrow("Missing");
    f.zip.file("manifest.sig", "invalid cms");
    await expect(verifyExportPack(await f.output(), { trustedPublicKey: f.publicKey })).rejects.toThrow("cms_parse_failed");
    f.zip.file("manifest.sig", original);
    const descriptor = JSON.parse(await f.zip.file("signature.json")!.async("string"));
    f.zip.file("signature.json", JSON.stringify({ ...descriptor, key_id: "forged key id" }));
    await expect(verifyExportPack(await f.output(), { trustedPublicKey: f.publicKey })).rejects.toThrow("details do not match");
  });
  it("requires explicit unsigned verification and never calls it a verified signature", async () => {
    const f = await fixture(false);
    await expect(verifyExportPack(await f.output())).rejects.toThrow("unsigned");
    expect(await verifyExportPack(await f.output(), { allowUnsigned: true })).toMatchObject({ signature: "unsigned", publicKeyFingerprint: null });
  });
  it("does not silently accept stripped signature files", async () => {
    const f = await fixture();
    f.zip.remove("manifest.sig");
    f.zip.file("signature.json", JSON.stringify({ status: "unsigned", reason: "not_configured" }));
    await expect(verifyExportPack(await f.output(), { trustedPublicKey: f.publicKey })).rejects.toThrow("unsigned");
  });
  it("rejects duplicate ZIP paths before a reader can choose a different payload", async () => {
    const f = await fixture();
    f.zip.file("foobar.pdf", "malicious duplicate");
    const bytes = Buffer.from(await f.output());
    let at = bytes.indexOf("foobar.pdf");
    while (at !== -1) { bytes.write("letter.pdf", at); at = bytes.indexOf("foobar.pdf", at + 10); }
    await expect(verifyExportPack(bytes, { trustedPublicKey: f.publicKey })).rejects.toThrow(/Duplicate|ambiguous/);
  });
  it("rejects conflicting local-header and directory names", async () => {
    const f = await fixture(); const bytes = Buffer.from(await f.output());
    bytes.write("foobar.pdf", bytes.indexOf("letter.pdf"));
    await expect(verifyExportPack(bytes, { trustedPublicKey: f.publicKey })).rejects.toThrow(/ambiguous/);
  });
  it("rejects symbolic-link payloads even when the signed payload bytes match", async () => {
    const f = await fixture();
    f.zip.file("letter.pdf")!.unixPermissions = 0o120777;
    const bytes = await f.zip.generateAsync({ type: "uint8array", platform: "UNIX" });
    await expect(verifyExportPack(bytes, { trustedPublicKey: f.publicKey })).rejects.toThrow("non-regular");
  });
});

describe("ZIP record coverage", () => {
  it.each(["prefix", "between files", "before directory"])("rejects an unlisted local record at %s", async position => {
    const f = await fixture(), bytes = Buffer.from(await f.output());
    const layout = fixtureLayout(bytes);
    const at = position === "prefix" ? 0 : position === "between files" ? layout.records[1].local : layout.directory;
    const forged = spliceFixture(bytes, at, 0, await hiddenLocalRecord());
    // The same parser used by the former verifier still sees only signed files.
    const centralView = await JSZip.loadAsync(forged);
    expect(centralView.file("notes.txt")).toBeNull();
    expect(await centralView.file("letter.pdf")!.async("string")).toBe("exact PDF bytes");
    expect(forged.includes(Buffer.from("Harmless but unsigned notes."))).toBe(true);
    await expect(verifyExportPack(forged, { trustedPublicKey: f.publicKey })).rejects.toThrow(/ZIP/);
  });
  it("rejects unclaimed padding between otherwise valid records", async () => {
    const f = await fixture(), bytes = Buffer.from(await f.output());
    const forged = spliceFixture(bytes, fixtureLayout(bytes).records[1].local, 0, Buffer.from([0, 0, 0]));
    await expect(verifyExportPack(forged, { trustedPublicKey: f.publicKey })).rejects.toThrow(/ZIP/);
  });
  it.each([-1, 1])("rejects declared payload intervals with a %i-byte gap or overlap", async change => {
    const f = await fixture(), bytes = Buffer.from(await f.output());
    const first = fixtureLayout(bytes).records[0];
    bytes.writeUInt32LE(first.size + change, first.local + 18);
    bytes.writeUInt32LE(first.size + change, first.central + 20);
    await expect(verifyExportPack(bytes, { trustedPublicKey: f.publicKey })).rejects.toThrow(/ZIP/);
  });
  it("rejects a hidden local file counted as trailing DEFLATE input", async () => {
    const f = await fixture(), bytes = Buffer.from(await f.output());
    const first = fixtureLayout(bytes).records[0], hidden = await hiddenLocalRecord();
    const forged = spliceFixture(bytes, first.data + first.size, 0, hidden);
    forged.writeUInt32LE(first.size + hidden.length, first.local + 18);
    forged.writeUInt32LE(first.size + hidden.length, first.central + hidden.length + 20);
    // Pako/JSZip stops at the DEFLATE end marker and ignores the appended record.
    const centralView = await JSZip.loadAsync(forged);
    expect(await centralView.file("letter.pdf")!.async("string")).toBe("exact PDF bytes");
    await expect(verifyExportPack(forged, { trustedPublicKey: f.publicKey })).rejects.toThrow(/ZIP/);
  });
  it.each([14, 18, 22])("rejects inconsistent local CRC/size metadata at offset %i", async offset => {
    const f = await fixture(), bytes = Buffer.from(await f.output());
    const local = fixtureLayout(bytes).records[0].local;
    bytes.writeUInt32LE((bytes.readUInt32LE(local + offset) + 1) >>> 0, local + offset);
    await expect(verifyExportPack(bytes, { trustedPublicKey: f.publicKey })).rejects.toThrow(/ZIP/);
  });
  it("checks the actual CRC even when local and central metadata agree", async () => {
    const f = await fixture(), bytes = Buffer.from(await f.output());
    const first = fixtureLayout(bytes).records[0];
    const bad = (bytes.readUInt32LE(first.local + 14) + 1) >>> 0;
    bytes.writeUInt32LE(bad, first.local + 14); bytes.writeUInt32LE(bad, first.central + 16);
    await expect(verifyExportPack(bytes, { trustedPublicKey: f.publicKey })).rejects.toThrow(/CRC|ZIP/);
  });
  it("rejects an unsigned payload disguised as a directory", async () => {
    const f = await fixture(); f.zip.file("notes.txt", "unsigned notes");
    const bytes = Buffer.from(await f.output());
    const entry = fixtureLayout(bytes).records.find(row => row.name === "notes.txt")!;
    bytes.writeUInt32LE(0x10, entry.central + 38);
    const centralView = await JSZip.loadAsync(bytes);
    expect(centralView.files["notes.txt/"].dir).toBe(true);
    await expect(verifyExportPack(bytes, { trustedPublicKey: f.publicKey })).rejects.toThrow(/ZIP/);
  });
  it.each(["Unicode alias", "ZIP64", "truncated field"])("rejects ambiguous extra metadata: %s", async change => {
    const f = await fixture(true, "evidence/café.txt"), bytes = Buffer.from(await f.output());
    const entry = fixtureLayout(bytes).records.find(row => row.name === "evidence/café.txt")!;
    const extras = [entry.local + 30 + bytes.readUInt16LE(entry.local + 26),
      entry.central + 46 + bytes.readUInt16LE(entry.central + 28)];
    for (const at of extras) {
      expect(bytes.readUInt16LE(at)).toBe(0x7075);
      if (change === "Unicode alias") bytes[at + 9] ^= 1;
      else if (change === "ZIP64") bytes.writeUInt16LE(1, at);
      else bytes.writeUInt16LE(bytes.readUInt16LE(at + 2) + 1, at + 2);
    }
    await expect(verifyExportPack(bytes, { trustedPublicKey: f.publicKey })).rejects.toThrow(/ZIP/);
  });
  it("accepts a different central-directory order with the same one-to-one local records", async () => {
    const f = await fixture(), bytes = Buffer.from(await f.output());
    const { records, directory, end } = fixtureLayout(bytes);
    const entries = records.map((record, i) => bytes.subarray(record.central, records[i + 1]?.central ?? end));
    const reordered = Buffer.concat([bytes.subarray(0, directory), ...entries.reverse(), bytes.subarray(end)]);
    expect(await verifyExportPack(reordered, { trustedPublicKey: f.publicKey })).toMatchObject({ signature: "verified" });
  });
  it("accepts signed payload bytes containing ZIP signatures without scanning them as records", async () => {
    const f = await fixture(true, "evidence/nested.zip", await hiddenLocalRecord());
    const bytes = await f.zip.generateAsync({ type: "uint8array", compression: "STORE" });
    expect(await verifyExportPack(bytes, { trustedPublicKey: f.publicKey })).toMatchObject({ signature: "verified" });
  });
  it.each(["STORE", "DEFLATE"] as const)("accepts JSZip %s streaming descriptors, UTF-8 names and folders", async compression => {
    const f = await fixture(true, "evidence/café.txt");
    const bytes = await f.zip.generateAsync({ type: "uint8array", compression, streamFiles: true });
    expect(await verifyExportPack(bytes, { trustedPublicKey: f.publicKey })).toMatchObject({ signature: "verified" });
  });
  it("accepts an unambiguous descriptor without its optional signature", async () => {
    const f = await fixture();
    const bytes = Buffer.from(await f.zip.generateAsync({ type: "uint8array", compression: "DEFLATE", streamFiles: true }));
    const first = fixtureLayout(bytes).records[0];
    expect(bytes.readUInt32LE(first.data + first.size)).toBe(0x08074b50);
    const changed = spliceFixture(bytes, first.data + first.size, 4, Buffer.alloc(0));
    expect(await verifyExportPack(changed, { trustedPublicKey: f.publicKey })).toMatchObject({ signature: "verified" });
  });
  it.each(["missing", "wrong CRC", "wrong size", "wrong local size"])("rejects a streamed entry with %s metadata", async change => {
    const f = await fixture();
    let bytes = Buffer.from(await f.zip.generateAsync({ type: "uint8array", compression: "DEFLATE", streamFiles: true }));
    const first = fixtureLayout(bytes).records[0], descriptor = first.data + first.size;
    if (change === "missing") bytes = spliceFixture(bytes, descriptor, 16, Buffer.alloc(0));
    else {
      const offset = change === "wrong CRC" ? descriptor + 4 : change === "wrong size" ? descriptor + 8 : first.local + 18;
      bytes.writeUInt32LE((bytes.readUInt32LE(offset) + 1) >>> 0, offset);
    }
    await expect(verifyExportPack(bytes, { trustedPublicKey: f.publicKey })).rejects.toThrow(/ZIP/);
  });
});

describe("signing transport", () => {
  it("pins the workspace and accepts only an explicit not-configured response", async () => {
    const f = await fixture();
    const fetcher = vi.fn().mockResolvedValue(Response.json({ status: "unsigned", reason: "not_configured" }));
    vi.stubGlobal("fetch", fetcher);
    expect(await requestPackSignature(f.manifest, f.bytes, () => true)).toEqual({ status: "unsigned", reason: "not_configured" });
    const request = fetcher.mock.calls[0][1];
    expect(request.headers["X-Workspace-ID"]).toBe(workspaceId);
    expect(decodeBase64(JSON.parse(request.body).manifest_b64)).toEqual(f.bytes);
  });
  it.each([401, 403, 404, 409, 429, 500, 503])("does not downgrade HTTP %i to unsigned success", async status => {
    const f = await fixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "failed" }, { status })));
    await expect(requestPackSignature(f.manifest, f.bytes, () => true)).rejects.toThrow("failed");
  });
  it("rejects changed workspace after a signing response", async () => {
    const f = await fixture(); let current = true;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => { current = false; return Response.json({ status: "unsigned", reason: "not_configured" }); }));
    await expect(requestPackSignature(f.manifest, f.bytes, () => current)).rejects.toThrow("Workspace changed");
  });
  it("rejects a signed response for different manifest bytes", async () => {
    const f = await fixture();
    const descriptor = JSON.parse(await f.zip.file("signature.json")!.async("string"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...descriptor,
      content_sha256: "0".repeat(64), cms_b64: encodeBase64(await f.zip.file("manifest.sig")!.async("uint8array")) })));
    await expect(requestPackSignature(f.manifest, f.bytes, () => true)).rejects.toThrow("does not match");
  });
});
