import { createHash } from "node:crypto";

export function normalizeComparableText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(normalizeComparableText(value).split(" ").filter((token) => token.length >= 2));
}

export function jaccardSimilarity(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

export function semanticFingerprint(question) {
  const normalized = normalizeComparableText(
    `${question?.questionType || ""} ${question?.passage || ""} ${question?.stem || ""}`,
  );
  return createHash("sha256").update(normalized).digest("hex").slice(0, 24);
}

export function findDuplicateQuestion(candidate, existingQuestions) {
  const fingerprint = semanticFingerprint(candidate);
  for (const existing of existingQuestions) {
    if (existing.semanticFingerprint === fingerprint || semanticFingerprint(existing) === fingerprint) {
      return { duplicate: true, reason: "same-normalized-content" };
    }
    const passageSimilarity = jaccardSimilarity(candidate.passage, existing.passage);
    const stemSimilarity = jaccardSimilarity(candidate.stem, existing.stem);
    if (passageSimilarity >= 0.78 || (passageSimilarity >= 0.58 && stemSimilarity >= 0.72)) {
      return { duplicate: true, reason: `semantic-similarity:${passageSimilarity.toFixed(2)}:${stemSimilarity.toFixed(2)}` };
    }
  }
  return { duplicate: false, reason: "" };
}

