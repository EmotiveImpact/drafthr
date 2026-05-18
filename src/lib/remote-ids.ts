const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Postgres-backed workspace tables use uuid primary keys, while older
 * browser-only records used readable ids such as `draft_abc_123`. Keep a
 * stable bridge so those legacy local records can still sync and delete
 * against uuid columns without mutating the user's local ids.
 */
export function toServerUuid(id: string): string {
  const value = id.trim();
  if (UUID_RE.test(value)) return value.toLowerCase();

  const bytes = hashToBytes(`drafthr:${value}`);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuid(bytes);
}

export function serverUuidOrNull(id: string | null | undefined): string | null {
  if (typeof id !== "string") return null;
  const value = id.trim();
  return UUID_RE.test(value) ? value.toLowerCase() : null;
}

function hashToBytes(input: string): Uint8Array {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;

  for (let i = 0; i < input.length; i += 1) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);

  const out = new Uint8Array(16);
  writeUint32(out, 0, (h1 ^ h2 ^ h3 ^ h4) >>> 0);
  writeUint32(out, 4, (h2 ^ h1) >>> 0);
  writeUint32(out, 8, (h3 ^ h1) >>> 0);
  writeUint32(out, 12, (h4 ^ h1) >>> 0);
  return out;
}

function writeUint32(out: Uint8Array, offset: number, value: number): void {
  out[offset] = (value >>> 24) & 0xff;
  out[offset + 1] = (value >>> 16) & 0xff;
  out[offset + 2] = (value >>> 8) & 0xff;
  out[offset + 3] = value & 0xff;
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
