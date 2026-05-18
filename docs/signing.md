# Signing — KMS-backed Ed25519 + PAdES-B-T

Cryptographic signing of DraftHR export-pack manifests. Threat model: a
recipient (counsel, tribunal, ACAS officer) must be able to verify, offline,
that:

1. the manifest they hold is byte-identical to the one we exported;
2. it was exported by a specific DraftHR tenant at a specific UTC moment,
   independently attested by a third-party RFC 3161 Time-Stamp Authority;
3. the signing key has not been substituted.

## What ships

| Component | Path | Role |
|---|---|---|
| Signer interface | `src/lib/sign/types.ts` | `KmsSigner` shape + `getActiveSigner()` |
| KMS-backed signer | `src/lib/sign/kms-signer.ts` | AWS KMS Ed25519 (production) |
| Local-fallback signer | `src/lib/sign/local-signer.ts` | In-process Node Ed25519 (dev / CI) |
| CMS builder + parser | `src/lib/sign/pades.ts` | PAdES-B-T-style `SignedData` |
| Verifier | `src/lib/sign/verify.ts` | New + legacy code paths |
| HTTP endpoint | `api/sign/manifest.ts` | `POST /api/sign/manifest` |
| Tests | `src/lib/sign/*.test.ts` | KMS mock, round-trip, verifier |

## Algorithm

**Ed25519** (RFC 8032 PureEdDSA) end-to-end. AWS KMS exposes this as:

- `KeySpec = ECC_NIST_EDWARDS25519`
- `SigningAlgorithmSpec = ED25519_SHA_512`
- `MessageType = RAW` (Ed25519 hashes internally; the `_SHA_512` suffix
  names the digest *inside* EdDSA, not a caller-side pre-hash)

Sources:
- <https://docs.aws.amazon.com/kms/latest/developerguide/asymmetric-key-specs.html>
  ("Elliptic curve key specs", `ECC_NIST_EDWARDS25519`)
- <https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html>
  (Valid `SigningAlgorithm` values include `ED25519_SHA_512`)

Verified against the AWS docs on 2026-05-18.

## PAdES-B-T conformance

We produce a CMS `SignedData` (RFC 5652) that follows the structural rules
of PAdES-B-T (ETSI EN 319 142-1 §5.3):

- `signerInfos[0].signatureAlgorithm` = Ed25519 (OID `1.3.101.112`,
  RFC 8410)
- `signerInfos[0].digestAlgorithm` = SHA-256 (OID `2.16.840.1.101.3.4.2.1`)
- **Signed attributes:**
  - `content-type` (`1.2.840.113549.1.9.3`) = id-data
  - `message-digest` (`1.2.840.113549.1.9.4`) = SHA-256(manifest bytes)
  - `signing-time` (`1.2.840.113549.1.9.5`) = UTCTime
- **Unsigned attributes:**
  - `id-aa-signatureTimeStampToken` (`1.2.840.113549.1.9.16.2.14`) =
    inner ContentInfo of the RFC 3161 TimeStampResp from FreeTSA.

The Ed25519 signature value is computed over the DER encoding of the
SignedAttributes as a `SET OF Attribute` (universal tag `0x31`, lexically
sorted) per RFC 5652 §5.4.

### What we deliberately skip (and why)

- **`signing-certificate-v2` (RFC 5035).** Binds the SignerInfo to a
  specific X.509 cert. We don't yet wrap the Ed25519 KMS key in an X.509
  cert — the key is "bare" (no chain to a CA). Once we issue a cert for
  the production KMS key (private CA inside Vault or AWS PCA) we'll add
  this attribute and the PAdES claim upgrades from "PAdES-B-T-style" to
  "PAdES-B-T verbatim".

- **In-PDF embedding via the ISO 32000-1 §12.8 signature dictionary.** PAdES
  proper writes the CMS into `/Contents` of a PDF signature dictionary
  inside the PDF byte range. Our PDF render path is Puppeteer
  (`api/export/pdf.ts`) — HTML→PDF — and does not currently leave a
  reserved `/Contents` slot. Post-processing the Puppeteer output with
  `pdf-lib` to inject the signature dictionary is the natural next step;
  the cryptographic content is the same CMS this module already produces,
  so the move is mechanical. Until then the CMS lives as `manifest.sig`
  next to `manifest.json` inside the export ZIP — same offline-verifiable
  cryptography, sidecar carrier.

### Compliance claim

Today: **PAdES-B-T-style** (signature + RFC 3161 timestamp, no cert chain,
sidecar carrier). Upgrade path to **PAdES-B-T verbatim**: issue X.509 cert
for the KMS key + add the `signing-certificate-v2` signed attribute + move
the CMS into a PDF signature dictionary.

## Operational setup (production)

1. **Provision the KMS key** (eu-west-2 by default — set
   `AWS_REGION` to override):
   ```bash
   aws kms create-key \
     --region eu-west-2 \
     --description "DraftHR PAdES-B-T signing key" \
     --key-spec ECC_NIST_EDWARDS25519 \
     --key-usage SIGN_VERIFY
   ```
   Capture the `KeyId` from the output. Then create an alias:
   ```bash
   aws kms create-alias \
     --region eu-west-2 \
     --alias-name alias/drafthr-signing \
     --target-key-id <KeyId>
   ```

2. **Grant the Vercel runtime IAM principal `kms:Sign` and
   `kms:GetPublicKey`** on the key. Minimum policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["kms:Sign", "kms:GetPublicKey", "kms:DescribeKey"],
       "Resource": "arn:aws:kms:eu-west-2:<account>:key/<key-id>"
     }]
   }
   ```

3. **Set Vercel env vars** in the Production environment:
   ```
   SIGNING_KMS_KEY_ID=alias/drafthr-signing
   AWS_REGION=eu-west-2
   AWS_ACCESS_KEY_ID=...   # or use OIDC federation
   AWS_SECRET_ACCESS_KEY=...
   ```

4. **Verify**: hit `POST /api/sign/manifest` from a staging deploy with a
   small test manifest. The response includes `signed_at` (TSA-attested)
   and `tsa: "freetsa"`. CloudTrail will show a single `kms.Sign` event
   per signing call.

5. **Rotate the dev key**: once production is fully on KMS, drop
   `DRAFTHR_SIGNING_KEY_HEX` from your dotenv. The local signer will then
   mint an ephemeral key per Vercel function cold-start — fine for dev,
   broken for any non-dev tenant which is what we want.

## Verifier behavior

`src/lib/sign/verify.ts` exposes two entry points:

- `verifyPadesCms({ cms, expectedContent, expectedPublicKey })` — the
  PAdES-B-T-style path. Returns `{ ok: true, signedAt, signedBy,
  publicKeyFingerprint, contentSha256Hex, tsa }` on success.
- `verifyLegacy({ tsr, expectedSha256Hex })` — accepts the side-channel
  TSR-only shape that pre-PAdES exports recorded in `audit_events`. Returns
  `{ ok: true, legacy: true, ... }`. Required for back-compat with any
  letter exported before this wave landed.

Failure modes are surfaced as a tagged union: `byte_range_tampered`,
`signature_mismatch`, `tsa_invalid`, `tsa_missing`, `cms_parse_failed`,
`unsupported_signature_algorithm`, `wrong_public_key`,
`message_digest_mismatch`. Callers (`api/audit/verify-tsr.ts`, future
verify-manifest endpoint) decide whether to leak the reason to the end
user or fold it into a single "Verification failed" error.

## Backward compatibility

Pre-wave exports recorded a `draft.exported` audit event with the TSR
base64 in the payload and an `X-Drafthr-TSR-Base64` response header. The
PDF itself was never signed. We did **not** rewrite history — those
letters still verify via `verifyLegacy(...)` and the existing
`POST /api/audit/verify-tsr` endpoint. New letters get `manifest.sig` in
the ZIP and a `draft.signed_with_kms` (or `draft.signed_local`) audit
event in addition to the existing `draft.exported`.

## FreeTSA dependency

FreeTSA (<https://freetsa.org>) is a community-run RFC 3161 TSA. Free, no
SLA. The TSA cert SHA-256 is pinned at two values in `api/_utils/tsa.ts`
to cover the March-2026 key rotation. When FreeTSA is unreachable, the
signing endpoint produces a PAdES-B-B signature (no timestamp) and records
`tsa_status: unavailable` in the audit row — never block an export.

**Migration path if FreeTSA disappears**: swap to a paid TSA. Options
include Sectigo Time Stamping (£~£0.005/timestamp), GlobalSign DSS, or
DigiCert TSS. Replacement is a one-line change in
`api/_utils/tsa.ts:FREETSA_URL` + a new pin in
`FREETSA_TSA_KEY_SHA256_PINS` (rename the constant when you do this).

## Audit chain

Every successful signing call appends a hash-chained audit event with:
- `kind = "draft.signed_with_kms"` (KMS path) or `"draft.signed_local"`
  (dev path)
- `payload = { algorithm: "Ed25519", sha256, signed_at, tsa, tsa_status,
   tsa_reason }`

The WorkOS Audit Logs sink that sibling task 2B wires up subscribes to
`draft.*` events and forwards them — no new code on this side needed.
