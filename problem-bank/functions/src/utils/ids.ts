import { createHash, randomBytes } from "node:crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeBase32(value: bigint, length: number): string {
  let output = "";
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    output = CROCKFORD[Number(remaining & 31n)] + output;
    remaining >>= 5n;
  }
  return output;
}

function randomBase32(length: number): string {
  const bytes = randomBytes(Math.ceil((length * 5) / 8));
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return encodeBase32(value, length).slice(-length);
}

export function createPermanentId(prefix: "XUQ" | "XUS" | "XUG" | "XUC" | "XUE"): string {
  const timestamp = encodeBase32(BigInt(Date.now()), 10);
  return `${prefix}_${timestamp}${randomBase32(16)}`;
}

export function internalDocumentId(namespace: string, permanentId: string): string {
  const digest = createHash("sha256").update(`${namespace}:${permanentId}`).digest("hex").slice(0, 32);
  return `${namespace}_${digest}`;
}
