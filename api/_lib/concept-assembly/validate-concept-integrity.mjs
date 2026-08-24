import { createHash } from "node:crypto";

export function conceptContentHash(content) {
  return createHash("sha256").update(String(content ?? ""), "utf8").digest("hex");
}

export function validateConceptIntegrity(block) {
  return Boolean(
    block
      && typeof block.content === "string"
      && typeof block.contentHash === "string"
      && block.contentHash === conceptContentHash(block.content),
  );
}

export function assertConceptIntegrity(blocks) {
  for (const block of blocks) {
    if (!validateConceptIntegrity(block)) {
      throw new Error(`concept-integrity-failed:${block?.recordId || "unknown"}`);
    }
  }
  return true;
}

