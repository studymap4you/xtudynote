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
  wordnetReferenceCount?: number;
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

export type AcademyPartProgress = {
  completed: number;
  total: number;
  label: string;
};

export type AcademyUnitGenerationOptions = {
  onProgress?: (progress: AcademyPartProgress) => void;
  shouldPause?: () => boolean;
};

const REQUEST_RETRY_DELAYS = [0, 1_200, 3_500, 7_000];

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (!delayMs) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, delayMs);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

function retryableResponse(status: number, message: string): boolean {
  if (/연결되지 않았습니다|설정이 필요합니다|로그인/i.test(message)) return false;
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

async function postAcademyRequest<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("로그인 후 장편 교재를 생성할 수 있습니다.");
  }
  const idToken = await user.getIdToken();
  let lastError = "장편 교재 생성 요청에 실패했습니다.";
  for (let attempt = 0; attempt < REQUEST_RETRY_DELAYS.length; attempt += 1) {
    await waitForRetry(REQUEST_RETRY_DELAYS[attempt], signal);
    try {
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
      if (response.ok) return payload;
      lastError = payload.error || "장편 교재 생성 요청에 실패했습니다.";
      if (!retryableResponse(response.status, lastError) || attempt === REQUEST_RETRY_DELAYS.length - 1) {
        const requestError = new Error(lastError);
        requestError.name = "AcademyRequestError";
        throw requestError;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (error instanceof Error && error.name === "AcademyRequestError") throw error;
      lastError = error instanceof Error ? error.message : lastError;
      if (attempt === REQUEST_RETRY_DELAYS.length - 1 || /연결되지 않았습니다|설정이 필요합니다|로그인/i.test(lastError)) {
        throw new Error(lastError);
      }
    }
  }
  throw new Error(lastError);
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
  options: AcademyUnitGenerationOptions = {},
): Promise<UnitResponse> {
  const total = params.unit.conceptPageCount + params.unit.questionCount;
  let completed = 0;
  for (let partIndex = 0; partIndex < params.unit.conceptPageCount; partIndex += 1) {
    options.onProgress?.({
      completed,
      total,
      label: `${params.unit.unitIndex + 1}단원 · 개념 페이지 ${partIndex + 1}/${params.unit.conceptPageCount} 생성 중`,
    });
    await postAcademyRequest<ConceptPageResponse>(
      { action: "unit-concept", partIndex, ...params },
      signal,
    );
    completed += 1;
    options.onProgress?.({ completed, total, label: `${partIndex + 1}번째 개념 페이지 저장 완료` });
    if (options.shouldPause?.()) throw new Error("academy-generation-paused");
  }
  for (let partIndex = 0; partIndex < params.unit.questionCount; partIndex += 1) {
    options.onProgress?.({
      completed,
      total,
      label: `${params.unit.unitIndex + 1}단원 · 실전 문항 ${partIndex + 1}/${params.unit.questionCount} 생성 중`,
    });
    await postAcademyRequest<QuestionPartResponse>(
      { action: "unit-question", partIndex, ...params },
      signal,
    );
    completed += 1;
    options.onProgress?.({ completed, total, label: `${partIndex + 1}번째 실전 문항 저장 완료` });
    if (options.shouldPause?.()) throw new Error("academy-generation-paused");
  }
  options.onProgress?.({ completed, total, label: `${params.unit.unitIndex + 1}단원 조각을 합치고 품질 검수 중` });
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
