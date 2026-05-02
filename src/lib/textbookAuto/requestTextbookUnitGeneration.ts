import {
  TEXTBOOK_AUTO_OPENAI_MODEL_FALLBACK,
  TEXTBOOK_AUTO_SYSTEM_PROMPT,
  buildTextbookUnitUserPrompt,
} from "@/config/textbookAutoPrompt";
import type { TextbookUnitContent } from "@/types/textbookAuto";

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

function normalizeStringList(v: unknown, maxItems: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string") {
      const t = item.trim();
      if (t) out.push(t);
    }
    if (out.length >= maxItems) break;
  }
  return out;
}

export function parseTextbookUnitJson(raw: unknown): TextbookUnitContent {
  if (raw === null || typeof raw !== "object") {
    throw new Error("AI 응답이 객체가 아닙니다.");
  }
  const o = raw as Record<string, unknown>;
  const unitTitle = typeof o.unitTitle === "string" ? o.unitTitle.trim() : "";
  if (!unitTitle) {
    throw new Error("unitTitle이 비었습니다.");
  }
  return {
    unitTitle,
    keyConcepts: normalizeStringList(o.keyConcepts, 40),
    contentStudy: normalizeStringList(o.contentStudy, 40),
    coreSummary: normalizeStringList(o.coreSummary, 30),
    practice: normalizeStringList(o.practice, 25),
    unitTest: normalizeStringList(o.unitTest, 25),
  };
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
      temperature: 0.4,
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
