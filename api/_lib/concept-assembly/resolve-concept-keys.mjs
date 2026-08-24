import { conceptMappingRegistry } from "./concept-mapping-registry.mjs";

export function resolveConceptKeys(questionTypes) {
  const resolved = [];
  const seen = new Set();
  for (const rawType of Array.isArray(questionTypes) ? questionTypes : []) {
    const questionType = String(rawType ?? "").trim().toUpperCase();
    for (const conceptKey of conceptMappingRegistry[questionType] || []) {
      if (seen.has(conceptKey)) continue;
      seen.add(conceptKey);
      resolved.push(conceptKey);
    }
  }
  return resolved;
}

