import type {
  AcademyTextbookPlan,
  CreateAcademyTextbookPlanParams,
  GenerateAcademyTextbookUnitParams,
} from "@/types/academyTextbook";
import type { PremiumTextbookUnit } from "@/types/premiumTextbook";
import { auth } from "@/firebase/config";

type ApiMeta = {
  model: string;
  source: "nvidia" | "openai" | "mock";
  generationVersion?: string;
  csatReferenceCount?: number;
  englishReferenceCount?: number;
};

type PlanResponse = {
  plan: AcademyTextbookPlan;
  meta: ApiMeta;
};

type UnitResponse = {
  unit: PremiumTextbookUnit;
  meta: ApiMeta;
};

type ConceptPageResponse = {
  conceptPage: NonNullable<PremiumTextbookUnit["conceptPages"]>[number];
  pageIndex: number;
  meta: ApiMeta;
};

type QuestionPartResponse = {
  question: PremiumTextbookUnit["questions"][number];
  questionIndex: number;
  meta: ApiMeta;
};

async function postAcademyRequest<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("로그인 후 장편 교재를 생성할 수 있습니다.");
  }
  const idToken = await user.getIdToken();
  const response = await fetch("/api/generate-academy-textbook", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "장편 교재 생성 요청에 실패했습니다.");
  }
  return payload;
}

export function createAcademyTextbookPlan(
  params: CreateAcademyTextbookPlanParams,
  signal?: AbortSignal,
): Promise<PlanResponse> {
  return postAcademyRequest<PlanResponse>({ action: "plan", ...params }, signal);
}

export async function generateAcademyTextbookUnit(
  params: GenerateAcademyTextbookUnitParams,
  signal?: AbortSignal,
): Promise<UnitResponse> {
  for (let partIndex = 0; partIndex < params.unit.conceptPageCount; partIndex += 1) {
    await postAcademyRequest<ConceptPageResponse>(
      { action: "unit-concept", partIndex, ...params },
      signal,
    );
  }
  for (let partIndex = 0; partIndex < params.unit.questionCount; partIndex += 1) {
    await postAcademyRequest<QuestionPartResponse>(
      { action: "unit-question", partIndex, ...params },
      signal,
    );
  }
  return postAcademyRequest<UnitResponse>({ action: "unit-finalize", ...params }, signal);
}

function keywordsForUnit(unit: GenerateAcademyTextbookUnitParams["unit"]): string[] {
  return [unit.title, unit.subtitle, ...unit.learningObjectives, ...unit.sourceFocus]
    .join(" ")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2)
    .filter((word, index, words) => words.indexOf(word) === index)
    .slice(0, 36);
}

function sourceChunks(sourceText: string): string[] {
  const paragraphs = sourceText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let buffer = "";
  for (const paragraph of paragraphs) {
    if (buffer && buffer.length + paragraph.length > 2_400) {
      chunks.push(buffer);
      buffer = "";
    }
    buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
  }
  if (buffer) chunks.push(buffer);
  return chunks.length > 0 ? chunks : [sourceText];
}

export function selectRelevantSourceExcerpt(
  sourceText: string,
  unit: GenerateAcademyTextbookUnitParams["unit"],
  maxLength = 28_000,
): string {
  const chunks = sourceChunks(sourceText);
  const keywords = keywordsForUnit(unit);
  const ranked = chunks
    .map((chunk, index) => {
      const lower = chunk.toLowerCase();
      const score = keywords.reduce((total, keyword) => total + (lower.includes(keyword) ? 1 : 0), 0);
      return { chunk, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const selected: string[] = [];
  let length = 0;
  for (const item of ranked) {
    if (length + item.chunk.length > maxLength && selected.length > 0) continue;
    selected.push(item.chunk);
    length += item.chunk.length;
    if (length >= maxLength) break;
  }
  return selected.join("\n\n---\n\n").slice(0, maxLength);
}
