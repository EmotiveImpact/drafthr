import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import JSZip from "jszip";
import type { Draft } from "../letters/types";
import { renderLetterPackBlob } from "./pack";
import { verifyExportPack } from "./verify-pack";
import { createLocalSigner } from "../sign/local-signer";
import { buildPadesCms } from "../sign/pades";
import { decodeBase64, encodeBase64 } from "./pack-integrity";

const state = vi.hoisted(() => ({ database: false, current: true, saved: vi.fn(), pdf: vi.fn(), docx: vi.fn() }));
vi.mock("./pdf", () => ({ renderLetterPdfBlob: state.pdf, filenameFor: () => "letter.pdf" }));
vi.mock("./docx", () => ({ renderLetterDocxBlob: state.docx, docxFilenameFor: () => "letter.docx" }));
vi.mock("@/lib/workspace-flags", () => ({ isDatabaseWorkspaceEnabled: () => state.database }));
vi.mock("@/lib/database-workspace", () => ({ savedWorkspaceDraft: state.saved,
  workspaceFileContext: () => ({ tenantId: "ce2c0080-d1c6-47ec-a3dd-6f0cf74b2d68", isCurrent: () => state.current }) }));

beforeEach(() => {
  vi.clearAllMocks(); state.database = false; state.current = true;
  vi.stubGlobal("crypto", webcrypto);
  state.pdf.mockResolvedValue(new Blob(["pdf exact bytes"]));
  state.docx.mockResolvedValue(new Blob(["docx exact bytes"]));
  state.saved.mockResolvedValue({ tenantId: "ce2c0080-d1c6-47ec-a3dd-6f0cf74b2d68", revision: 8, identity: "scope" });
});
afterEach(() => vi.unstubAllGlobals());

it("hashes every emitted artifact and reopens the exact persisted unsigned Blob", async () => {
  const outcome = vi.fn();
  const blob = await renderLetterPackBlob(draft(), undefined, { onIntegrity: outcome });
  const bytes = await readBlob(blob);
  const verified = await verifyExportPack(bytes, { allowUnsigned: true });
  expect(verified.signature).toBe("unsigned");
  expect(outcome).toHaveBeenCalledWith({ status: "unsigned", reason: "local_only" });
  expect(verified.manifest.files.map(file => file.path)).toEqual([
    "README.txt", "audit.json", "evidence/01-proof.txt", "evidence/index.html", "letter.docx", "letter.pdf", "pack-summary.html",
  ]);
  const zip = await JSZip.loadAsync(bytes);
  expect(await zip.file("evidence/01-proof.txt")!.async("string")).toBe("original evidence");
  expect(await zip.file("README.txt")!.async("string")).toContain("NOT a trust anchor");
  expect(zip.file("manifest.sig")).toBeNull();
});

it("keeps the original saved source revision while signing the resolved export bytes", async () => {
  state.database = true;
  const source = draft();
  const resolved = { ...source, title: "Resolved render copy" };
  const signer = createLocalSigner(); const publicKey = await signer.publicKey();
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url, options) => {
    const request = JSON.parse(options.body);
    const bytes = decodeBase64(request.manifest_b64);
    const now = new Date(); const signed = await buildPadesCms({ content: bytes, signer, signingTime: now });
    return Response.json({ status: "signed", cms_b64: encodeBase64(signed.cmsDer),
      public_key_b64: encodeBase64(publicKey), public_key_sha256: createHash("sha256").update(publicKey).digest("hex"),
      key_id: signer.keyId, algorithm: "Ed25519", content_sha256: signed.contentSha256Hex,
      signed_at: now.toISOString(), timestamp: "none" });
  }));
  const outcome = vi.fn();
  const blob = await renderLetterPackBlob(resolved, undefined, { sourceDraft: source, onIntegrity: outcome });
  expect(state.saved).toHaveBeenCalledWith(source);
  const verified = await verifyExportPack(await readBlob(blob), { trustedPublicKey: publicKey });
  expect(verified).toMatchObject({ signature: "verified", manifest: { draftRevision: 8, workspaceId: "ce2c0080-d1c6-47ec-a3dd-6f0cf74b2d68" } });
  expect(outcome).toHaveBeenCalledWith(expect.objectContaining({ status: "signed", timestamp: "none" }));
});

it("does not report a completed pack when configured signing fails", async () => {
  state.database = true;
  const outcome = vi.fn();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Signing unavailable" }, { status: 503 })));
  await expect(renderLetterPackBlob(draft(), undefined, { onIntegrity: outcome })).rejects.toThrow("Signing unavailable");
  expect(outcome).not.toHaveBeenCalled();
});

it("does not pack evidence bytes that differ from the saved private-file checksum", async () => {
  const source = draft();
  source.evidence![0] = { ...source.evidence![0], fileId: "private-file", fileSha256: "0".repeat(64) };
  await expect(renderLetterPackBlob(source)).rejects.toThrow("does not match the saved private file");
  expect(state.pdf).not.toHaveBeenCalled();
});

function readBlob(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onerror = reject;
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer)); reader.readAsArrayBuffer(blob);
  });
}
function draft(): Draft {
  return { id: "a358bb74-6202-4bf5-b76e-04cf982b3e82", mode: "employer", letterType: "warning", title: "Fictional pack",
    context: { mode: "employer", jurisdiction: "UK", workerClass: "employee", issueDate: "2026-10-03" },
    employee: { legalName: "Fictional Recipient" }, employer: { legalName: "Fictional Employer" },
    answers: {}, sections: [{ id: "body", sectionId: "body", title: "Body", required: true, status: "ready", versions: [], html: "<p>Fictional letter.</p>" }],
    evidence: [{ id: "proof", kind: "document", content: "Proof description", filename: "proof.txt", mimeType: "text/plain",
      fileDataUrl: "data:text/plain;base64,b3JpZ2luYWwgZXZpZGVuY2U=", includeVerbatim: false, uploadedAt: 1 }],
    createdAt: 1, updatedAt: 1, exports: [], comments: [] } as unknown as Draft;
}
