/**
 * KMS signer tests — exercise the cache + the Sign call shape without
 * requiring @aws-sdk/client-kms to actually be installed. We mock the
 * dynamic import via vi.doMock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const EXPECTED_PUBLIC_KEY_RAW = Uint8Array.from(
  Array.from({ length: 32 }, (_, i) => (i + 1) & 0xff),
);

// SPKI prefix (RFC 8410 §4) + raw key — what KMS GetPublicKey returns.
const ED25519_SPKI_PREFIX = Uint8Array.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
  0x03, 0x21, 0x00,
]);

function spkiFor(raw: Uint8Array): Uint8Array {
  const spki = new Uint8Array(ED25519_SPKI_PREFIX.length + raw.length);
  spki.set(ED25519_SPKI_PREFIX, 0);
  spki.set(raw, ED25519_SPKI_PREFIX.length);
  return spki;
}

type SendCall = { command: { name: string; input: Record<string, unknown> } };

function installKmsMock(opts: {
  signature?: Uint8Array;
  publicKey?: Uint8Array;
  signError?: Error;
  publicKeyError?: Error;
}): {
  send: ReturnType<typeof vi.fn>;
  calls: SendCall[];
} {
  const calls: SendCall[] = [];
  const send = vi.fn(async (command: { name: string; input: Record<string, unknown> }) => {
    calls.push({ command });
    if (command.name === "GetPublicKeyCommand") {
      if (opts.publicKeyError) throw opts.publicKeyError;
      return {
        KeyId: "arn:aws:kms:eu-west-2:111:key/abc",
        PublicKey: opts.publicKey ?? spkiFor(EXPECTED_PUBLIC_KEY_RAW),
        KeySpec: "ECC_NIST_EDWARDS25519",
        KeyUsage: "SIGN_VERIFY",
      };
    }
    if (command.name === "SignCommand") {
      if (opts.signError) throw opts.signError;
      return {
        KeyId: "arn:aws:kms:eu-west-2:111:key/abc",
        Signature: opts.signature ?? new Uint8Array(64).fill(0x42),
        SigningAlgorithm: "ED25519_SHA_512",
      };
    }
    throw new Error(`unexpected KMS command: ${command.name}`);
  });

  vi.doMock("@aws-sdk/client-kms", () => ({
    KMSClient: class {
      send = send;
    },
    GetPublicKeyCommand: class {
      name = "GetPublicKeyCommand";
      input: Record<string, unknown>;
      constructor(input: Record<string, unknown>) {
        this.input = input;
      }
    },
    SignCommand: class {
      name = "SignCommand";
      input: Record<string, unknown>;
      constructor(input: Record<string, unknown>) {
        this.input = input;
      }
    },
  }));

  return { send, calls };
}

describe("createKmsSigner", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("@aws-sdk/client-kms");
  });

  it("returns the raw 32-byte public key, stripping the SPKI prefix", async () => {
    installKmsMock({});
    const { createKmsSigner } = await import("./kms-signer.ts");
    const signer = await createKmsSigner({
      keyId: "alias/drafthr-signing",
      region: "eu-west-2",
    });

    const pk = await signer.publicKey();
    expect(pk).toEqual(EXPECTED_PUBLIC_KEY_RAW);
  });

  it("caches GetPublicKey — second call to publicKey() does not re-fetch", async () => {
    const mock = installKmsMock({});
    const { createKmsSigner } = await import("./kms-signer.ts");
    const signer = await createKmsSigner({
      keyId: "alias/drafthr-signing",
      region: "eu-west-2",
    });

    await signer.publicKey();
    await signer.publicKey();

    const publicKeyCalls = mock.calls.filter(
      (c) => c.command.name === "GetPublicKeyCommand",
    );
    expect(publicKeyCalls.length).toBe(1);
  });

  it("passes MessageType=RAW and SigningAlgorithm=ED25519_SHA_512 to Sign", async () => {
    const mock = installKmsMock({});
    const { createKmsSigner } = await import("./kms-signer.ts");
    const signer = await createKmsSigner({
      keyId: "alias/drafthr-signing",
      region: "eu-west-2",
    });

    const message = new Uint8Array([1, 2, 3, 4, 5]);
    const sig = await signer.sign(message);

    expect(sig.byteLength).toBe(64);
    const signCall = mock.calls.find((c) => c.command.name === "SignCommand");
    expect(signCall).toBeDefined();
    expect(signCall!.command.input).toMatchObject({
      KeyId: "alias/drafthr-signing",
      Message: message,
      MessageType: "RAW",
      SigningAlgorithm: "ED25519_SHA_512",
    });
  });

  it("preserves the KMS error code in thrown Sign errors", async () => {
    const kmsError = Object.assign(new Error("denied"), {
      name: "AccessDeniedException",
      $metadata: { httpStatusCode: 400 },
    });
    installKmsMock({ signError: kmsError });
    const { createKmsSigner } = await import("./kms-signer.ts");
    const signer = await createKmsSigner({
      keyId: "alias/drafthr-signing",
      region: "eu-west-2",
    });

    await expect(signer.sign(new Uint8Array([1]))).rejects.toThrow(
      /AccessDeniedException\[400\] denied/,
    );
  });

  it("rejects an empty message before hitting KMS", async () => {
    installKmsMock({});
    const { createKmsSigner } = await import("./kms-signer.ts");
    const signer = await createKmsSigner({
      keyId: "alias/drafthr-signing",
      region: "eu-west-2",
    });

    await expect(signer.sign(new Uint8Array(0))).rejects.toThrow(/non-empty/);
  });

  it("rejects an oversize message (>4096 bytes) before hitting KMS", async () => {
    installKmsMock({});
    const { createKmsSigner } = await import("./kms-signer.ts");
    const signer = await createKmsSigner({
      keyId: "alias/drafthr-signing",
      region: "eu-west-2",
    });

    await expect(signer.sign(new Uint8Array(4097))).rejects.toThrow(/too large/);
  });

  it("rejects a KeySpec other than ECC_NIST_EDWARDS25519", async () => {
    const send = vi.fn(async (command: { name: string }) => {
      if (command.name === "GetPublicKeyCommand") {
        return {
          PublicKey: new Uint8Array(64),
          KeySpec: "RSA_2048",
          KeyUsage: "SIGN_VERIFY",
        };
      }
      throw new Error("unexpected");
    });
    vi.doMock("@aws-sdk/client-kms", () => ({
      KMSClient: class {
        send = send;
      },
      GetPublicKeyCommand: class {
        name = "GetPublicKeyCommand";
        input: Record<string, unknown>;
        constructor(input: Record<string, unknown>) {
          this.input = input;
        }
      },
      SignCommand: class {
        name = "SignCommand";
        input: Record<string, unknown>;
        constructor(input: Record<string, unknown>) {
          this.input = input;
        }
      },
    }));
    const { createKmsSigner } = await import("./kms-signer.ts");
    const signer = await createKmsSigner({ keyId: "alias/foo", region: "eu-west-2" });
    await expect(signer.publicKey()).rejects.toThrow(/ECC_NIST_EDWARDS25519/);
  });
});
