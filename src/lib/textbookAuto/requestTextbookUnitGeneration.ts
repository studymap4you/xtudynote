import {
  TEXTBOOK_AUTO_OPENAI_MODEL_FALLBACK,
  TEXTBOOK_AUTO_SYSTEM_PROMPT,
  buildTextbookUnitUserPrompt,
} from "@/config/textbookAutoPrompt";
import type { TextbookUnitContent } from "@/types/textbookAuto";
import { normalizeUnitContentFromUnknown } from "@/lib/textbookAuto/normalizeUnitContent";

function readOpenAiKey(): string {
  return String(import.meta.env.VITE_OPENAI_API_KEY ?? "").trim();
}

function readOpenAiModel(): string {
  const m = String(import.meta.env.VITE_OPENAI_MODEL ?? "").trim();
  return m || TEXTBOOK_AUTO_OPENAI_MODEL_FALLBACK;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function parseTextbookUnitJson(raw: unknown): TextbookUnitContent {
  if (raw === null || typeof raw !== "object") {
    throw new Error("AI 응답이 객체가 아닙니다.");
  }
  const o = normalizeUnitContentFromUnknown(raw as Record<string, unknown>);
  if (!o.unitTitle.trim() || o.unitTitle === "(제목 없음)") {
    throw new Error("unitTitle이 비었습니다.");
  }
  return o;
}

export type TextbookUnitGenMeta = { model: string };

/**
 * 1단원·N단원 공통: 원문 + 단원 인덱스로 5섹션 JSON 생성 (OpenAI JSON mode).
 */
export async function requestTextbookUnitGeneration(params: {
  bookTitle: string;
  sourceText: string;
  unitIndex: number;
  totalUnits: number;
  practiceMin: number;
  unitTestMcq: number;
  unitTestShort: number;
}): Promise<{ unit: TextbookUnitContent; meta: TextbookUnitGenMeta }> {
  const apiKey = readOpenAiKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API 키가 없습니다. .env.local에 VITE_OPENAI_API_KEY를 설정한 뒤 개발 서버를 다시 실행하세요.",
    );
  }
  const model = readOpenAiModel();
  const userContent = buildTextbookUnitUserPrompt(params);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: TEXTBOOK_AUTO_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `OpenAI 요청 실패 (${res.status})`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!isNonEmptyString(content)) {
    throw new Error("OpenAI 응답에 본문이 없습니다.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error("AI 응답 JSON 파싱에 실패했습니다.");
  }

  return { unit: parseTextbookUnitJson(parsed), meta: { model } };
}
