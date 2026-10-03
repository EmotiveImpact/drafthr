# Export-pack integrity and signing

Implementation status, 3 October 2026: export ZIPs contain a versioned,
canonical manifest with SHA-256 and byte counts for every payload file. A
configured AWS KMS signer adds an Ed25519 CMS sidecar. Signing is **not yet
verified against a provisioned hosted KMS key**; local tests use real Node
Ed25519 keys and mocked authenticated database/provider boundaries.

## What a pack contains

| File | Purpose |
| --- | --- |
| `manifest.json` | Canonical UTF-8 JSON: format, workspace, draft ID/revision, generation time, metadata and sorted payload hashes |
| `signature.json` | Explicit `signed` or `unsigned` status; signed packs also include key information and a manifest digest |
| `manifest.sig` | DER CMS SignedData covering the exact manifest bytes; present only for signed packs |
| `README.txt` | Recipient instructions and limitations, itself included in the payload hashes |
| PDF, DOCX, summary, audit and evidence files | Exact output bytes listed in the manifest |

The three manifest/signature control files are deliberately excluded from the
payload list to avoid circular self-hashing. Every other non-directory entry
must be listed exactly once. The verifier rejects changed, missing, extra,
duplicate, unsafe or ambiguous paths. It also checks declared sizes with bounded
decompression. The ZIP format is limited to a 25 MB archive, 100 MB uncompressed
payload, 512 payload files and 200 KB canonical manifest; ZIP64, encrypted and
multi-disk archives are unsupported. These are verification bounds, not an
increase to the application's existing private-file upload limits.

Canonical JSON recursively sorts object keys, preserves array order and has no
whitespace or trailing newline. `files` is sorted by path. Metadata is descriptive
application data, not an independently verified statement of fact.

## Export behavior

1. The database workflow captures the exact saved source draft's revision and
   workspace before rendering. Private-file evidence must match its saved size
   and SHA-256 when those values are available.
2. PDF, DOCX, HTML, audit, README and evidence bytes are produced and hashed. A
   failed renderer prevents a partial ZIP from being saved.
3. The browser posts the exact canonical manifest bytes to
   `POST /api/sign/manifest`, with the active workspace pinned in the request.
4. The endpoint requires authentication, active organization membership, a
   permitted workspace role, matching manifest/workspace/draft IDs and the live
   saved revision of a non-deleted draft. It validates the canonical schema before
   using a signing key.
5. If `SIGNING_KMS_KEY_ID` is unset, the endpoint explicitly returns
   `{ "status": "unsigned", "reason": "not_configured" }`. The UI and ZIP report
   that status. Browser-only legacy exports report `local_only`. Neither path
   generates an ephemeral key or claims a digital signature.
6. If configured, the KMS-backed Ed25519 signer signs the CMS signed attributes
   containing the manifest digest. The server verifies its own result and writes
   a durable signing audit event before returning success. Authentication,
   transport, provider, malformed-response and audit failures stop the export;
   they never silently downgrade to unsigned success.
7. Finalise reports the outcome only after the finished ZIP is confirmed in
   private storage. Existing saved ZIPs are not rewritten or retroactively signed.

The service signs the authenticated caller's submitted manifest and artifact
hashes. It does **not** independently rerender all documents on the server or
certify that their text agrees with the user's account, facts or legal position.

## Recipient verification and trust

An included public key is **not a trust anchor**: an attacker could replace an
entire unsigned pack, or replace a signed pack together with its key. Obtain the
expected raw 32-byte Ed25519 public key and full SHA-256 fingerprint independently
from the workspace administrator through a trusted channel. Retain historical
trusted keys when rotating production keys.

Using a trusted, installed DraftHR source checkout:

```sh
node --import tsx src/lib/export/verify-pack-cli.ts /path/to/pack.zip /path/to/trusted-key.b64
```

The key file contains base64 of the raw 32-byte public key, not PEM. The CLI
performs no network calls and does not extract attachments to disk. It checks
all payload hashes, the canonical manifest, the CMS signature and its binding
to the independently supplied key. Signature stripping or a missing key cannot
produce a verified-signed result.

For an explicitly unsigned pack, checksum-only inspection requires an explicit
opt-in:

```sh
node --import tsx src/lib/export/verify-pack-cli.ts /path/to/pack.zip --allow-unsigned
```

The result remains `unsigned`; matching checksums alone do not establish origin.
Do not run a verification program supplied only inside an untrusted attachment.
A separately distributed recipient verifier and trusted public-key registry are
still operational/product rollout decisions.

## What is not claimed

- No embedded PDF signature, PAdES conformance, certificate-chain trust, qualified
  electronic signature, legal admissibility or accuracy guarantee.
- No independent trusted timestamp. `signed_at` is an application-claimed time
  protected by the signature, not proof from a Time-Stamp Authority.
- No regulatory WORM protection. Private immutable application objects and hash
  checks do not prevent an infrastructure administrator from changing storage.
- No independent proof of the author, counsel attestation or truth of evidence.

The older implementation files retain their `pades.ts` / `verifyPadesCms` names
for compatibility. They produce/parse CMS; those filenames do not establish
PAdES conformance. New export signing does not call FreeTSA or embed a token.

## Production configuration and outstanding gates

- Provision an appropriate asymmetric signing key and grant only the deployed
  signing service the necessary `Sign` and `GetPublicKey` permissions.
- Set `SIGNING_KMS_KEY_ID` and `AWS_REGION` in the intended environment, with
  provider credentials/identity configured securely. The existing adapter uses
  `ECC_NIST_EDWARDS25519`, `ED25519_SHA_512` and `MessageType: RAW`; verify actual
  region/key/SDK support and permissions during hosted staging qualification.
- `DRAFTHR_SIGNING_KEY_HEX` is a direct development/test signer input only. The
  export endpoint ignores it and never falls back to that signer.
- Publish the independently trusted public key/fingerprint, custody policy,
  rotation and historical-key verification process. Agree retention and access
  rules for signing audit records.
- Exercise hosted rendering → signing → private ZIP save → download → offline
  verification, including wrong-workspace access, stale revisions, KMS failure,
  audit-write failure and key rotation. Mocked/local tests are not this evidence.
- If independent timestamping or regulated signatures become a requirement,
  scope and implement that protocol separately, including correct signature/time
  binding, trust-chain validation, revocation and recipient interoperability.

## Compatibility

Historical PDF export timestamp receipts and CMS helpers remain readable.
`verifyPadesCms` still requires a valid timestamp by default for those callers;
only the new explicitly timestamp-free pack verifier opts out. A timestamp that
does not cover the historical manifest digest is rejected. `verifyLegacy`
continues to check historical raw TSR receipts against their expected hash.

Old ZIPs without this versioned manifest are not falsely labeled verified. They
remain downloadable; the new verifier rejects unsupported legacy pack formats.

## Code and focused checks

- Writer: `src/lib/export/pack.ts`
- Shared format and transport validation: `src/lib/export/pack-integrity.ts`
- Authenticated endpoint: `api/sign/manifest.ts`
- Offline verifier/CLI: `src/lib/export/verify-pack.ts`, `verify-pack-cli.ts`
- Existing Ed25519/CMS implementation: `src/lib/sign/`

```sh
npx vitest run --maxWorkers=2 src/lib/export/pack-integrity.test.ts src/lib/export/pack.render.test.ts api/sign/manifest.test.ts src/lib/sign/verify.test.ts
```

Tests cover actual signature round-trips with local keys; signed/unsigned ZIP
reopen; exact saved-source revision propagation; per-file corruption, missing
and extra files; altered manifests; wrong/untrusted keys; malformed or stripped
signatures; path ambiguity; provider/audit failures; workspace scope and stale
revision rejection; and historical timestamp/content mismatch.
