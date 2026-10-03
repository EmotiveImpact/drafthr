/** Run from an independently obtained, installed source checkout. */
import { readFile } from "node:fs/promises";
import { verifyExportPack } from "./verify-pack.js";
import { decodeBase64 } from "./pack-integrity.js";

const [file, trustedKeyFile, ...extra] = process.argv.slice(2);
if (!file || !trustedKeyFile || extra.length) {
  console.error("Usage: node --import tsx src/lib/export/verify-pack-cli.ts <pack.zip> <trusted-key.b64 | --allow-unsigned>");
  process.exitCode = 1;
} else {
  try {
    const result = await verifyExportPack(await readFile(file), trustedKeyFile === "--allow-unsigned"
      ? { allowUnsigned: true }
      : { trustedPublicKey: decodeBase64((await readFile(trustedKeyFile, "utf8")).trim()) });
    console.log(JSON.stringify({
      signature: result.signature, filesChecked: result.manifest.files.length,
      draftId: result.manifest.draftId, workspaceId: result.manifest.workspaceId,
      draftRevision: result.manifest.draftRevision, publicKeyFingerprint: result.publicKeyFingerprint,
      trustedTimestamp: false,
      note: result.signature === "verified" ? "Bytes verified against the independently supplied key; no legal or timestamp claim."
        : "Checksums match only. This unsigned pack's origin is not verified.",
    }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Pack verification failed");
    process.exitCode = 1;
  }
}
