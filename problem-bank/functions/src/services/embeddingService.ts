import { createHash } from "node:crypto";
import type { ProblemDraft, ProblemSearchQuery } from "../models/problem.js";
import { cleanText } from "../utils/normalization.js";

export interface EmbeddingProvider {
  readonly dimension: number;
  embed(text: string): Promise<number[]>;
}

function features(text: string): Array<{ value: string; weight: number }> {
  const tokens = cleanText(text, 80_000)
    .toLowerCase()
    .normalize("NFKC")
    .match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) || [];
  const output = tokens.map((value) => ({ value: `t:${value}`, weight: 1 }));
  for (let index = 0; index < tokens.length - 1; index += 1) {
    output.push({ value: `b:${tokens[index]}_${tokens[index + 1]}`, weight: 0.65 });
  }
  return output;
}

export class HashEmbeddingProvider implements EmbeddingProvider {
  readonly dimension: number;

  constructor(dimension = 256) {
    this.dimension = dimension;
  }

  async embed(text: string): Promise<number[]> {
    const vector = Array.from({ length: this.dimension }, () => 0);
    for (const feature of features(text)) {
      const digest = createHash("sha256").update(feature.value).digest();
      const bucket = digest.readUInt32BE(0) % this.dimension;
      const sign = digest[4] % 2 === 0 ? 1 : -1;
      vector[bucket] += sign * feature.weight;
    }
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0));
    if (!norm) return vector;
    return vector.map((value) => Number((value / norm).toFixed(8)));
  }
}

export function problemEmbeddingText(problem: ProblemDraft): string {
  return [
    problem.subject,
    problem.examFamily,
    problem.questionType,
    problem.subtype,
    problem.passage,
    problem.question,
    ...(problem.choices || []),
    ...(problem.conceptTags || []),
    ...(problem.skillTags || []),
  ].filter(Boolean).join("\n");
}

export function queryEmbeddingText(query: ProblemSearchQuery): string {
  return [
    query.subject,
    query.examFamily,
    query.questionType,
    query.subtype,
    query.sourceText,
    ...(query.conceptTags || []),
    ...(query.skillTags || []),
  ].filter(Boolean).join("\n");
}
