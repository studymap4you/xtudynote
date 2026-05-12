import { TEXTBOOK_AUTO_OPENAI_MODEL_FALLBACK } from "@/config/textbookAutoPrompt";
import type { SourceModuleFieldKey, TextbookUnitSourceModule } from "@/types/textbookAuto";
import { SOURCE_MODULE_FIELD_KEYS, SOURCE_MODULE_FIELD_LABELS } from "@/types/textbookAuto";
import { getSourceModuleFieldValue } from "@/lib/textbookAuto/combineUnitPassage";

function readOpenAiKey(): string {
  return String(import.meta.env.VITE_OPENAI_API_KEY ?? "").trim();
}

function readOpenAiModel(): string {
  const m = String(import.meta.env.VITE_OPENAI_MODEL ?? "").trim();
  return m || TEXTBOOK_AUTO_OPENAI_MODEL_FALLBACK;
}

function buildSiblingContext(mod: TextbookUnitSourceModule, exclude: SourceModuleFieldKey): string {
  const lines: string[] = [];
  for (const key of SOURCE_MODULE_FIELD_KEYS) {
    if (key === exclude) continue;
    const v = getSourceModuleFieldValue(mod, key).trim();
    if (!v) continue;
    lines.push(`${SOURCE_MODULE_FIELD_LABELS[key]}:\n${v}`);
  }
  return lines.length > 0 ? lines.join("\n\n—\n\n") : "(이 모듈에는 다른 칸에 아직 입력된 내용이 없습니다. 지문·문제 등이 비어 있으면, 교재 맥락 안에서 합리적으로 채웁니다.)";
}

function fieldInstructions(field: SourceModuleFieldKey): string {
  switch (field) {
    case "passageNo":
      return "짧은 지문/세트 식별 번호·코드(예: 01, A-3). 기호나 접두만, 장문 금지.";
    case "passage":
      return "학습용 지문 본문. 사실 왜곡 없이, 같은 모듈의 다른 칸과 논리적으로 맞출 것.";
    case "question":
      return "발문 한 개(또는 한 세트의 핵심 질문). 선택지·정답 문구는 넣지 말 것.";
    case "options":
      return "객관식 선택지. ①②… 또는 줄바꿈으로 4개 전후가自然. 질문과 대응.";
    case "passageAnalysis":
      return "지문 논지·구조·표지 등 분석. 2~6문장 분량.";
    case "keySummary":
      return "핵심 정리. 불릿 없이 문단으로 쓰거나, 짧은 문장 여러 개.";
    case "reviewStudy":
      return "확인학습용 질문·과제 문장. 정답·해설은 생략.";
    default: {
      const _e: never = field;
      return _e;
    }
  }
}

/**
 * 세션 시작 전 모듈 폼: 한 칸만 OpenAI로 채움(JSON {"content":"..."}).
 */
export async function requestSourceModuleFieldAi(params: {
  bookTitle: string;
  unitIndex: number;
  moduleOrdinal: number;
  field: SourceModuleFieldKey;
  module: TextbookUnitSourceModule;
}): Promise<string> {
  const apiKey = readOpenAiKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API 키가 없습니다. .env.local에 VITE_OPENAI_API_KEY를 설정한 뒤 개발 서버를 다시 실행하세요.",
    );
  }
  const { bookTitle, unitIndex, moduleOrdinal, field, module } = params;
  const model = readOpenAiModel();
  const label = SOURCE_MODULE_FIELD_LABELS[field];
  const context = buildSiblingContext(module, field);
  const guide = fieldInstructions(field);

  const userContent = `교재 제목(참고): ${bookTitle.trim() || "교재"}
단원: 제 ${unitIndex + 1}단원
모듈: 화면의 모듈 ${moduleOrdinal}

같은 모듈의 다른 항목(참고):
---
${context}
---

요청 항목: 「${label}」
작성 지침: ${guide}

출력은 JSON 객체 하나만: {"content":"여기에 본문만"}`;

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
        {
          role: "system",
          content:
            "당신은 한국어 교육용 교재 편집자입니다. 사용자가 요청한 칸 하나만 작성합니다. JSON {\"content\":\"...\"} 만 출력하고 다른 키는 넣지 마세요.",
        },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `OpenAI 요청 실패 (${res.status})`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!raw) throw new Error("AI 응답이 비었습니다.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("AI 응답 JSON을 해석하지 못했습니다.");
  }
  if (typeof parsed !== "object" || parsed === null || !("content" in parsed)) {
    throw new Error("AI 응답에 content 필드가 없습니다.");
  }
  const content = (parsed as { content: unknown }).content;
  if (typeof content !== "string") throw new Error("AI content가 문자열이 아닙니다.");
  const out = content.trim();
  if (!out) throw new Error("AI가 빈 문자열만 반환했습니다.");
  return out;
}
