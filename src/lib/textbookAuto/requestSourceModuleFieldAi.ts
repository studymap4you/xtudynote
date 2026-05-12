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
      return [
        "「지문」칸에 있는 본문을 **문장 단위로 모두** 나누어 분석한다. 한 문장도 빠뜨리지 말 것(제목·표 구분이 있으면 문맥상 한 덩어리씩 처리).",
        "각 문장마다 아래 **네 항목**을 반드시 같은 순서·라벨로 쓴다(라벨은 정확히):",
        "1) 영문 — 해당 문장의 **영어 원문** 그대로",
        "2) 해석 — 한국어 직역·자연스러운 풀이",
        "3) 함축적 의미 — 문맥·화법·저자 의도 등 **함축된 뜻**",
        "4) 핵심표현 분석 — 관용구·문법·난해한 연결·핵심 어휘 등 **표현 단위** 짧은 분석",
        "문장이 여러 개면, 문장마다 위 네 줄 블록을 반복하고, 블록 사이에는 빈 줄 한 줄로 구분한다.",
        "지문이 비어 있으면 같은 모듈의 다른 참고만으로는 추정하지 말고, 짧게 ‘지문이 비어 있어 분석할 수 없습니다’만 쓴다.",
      ].join(" ");
    case "keySummary":
      return [
        "핵심을 **여러 항목**으로 정리한다. 항목마다 반드시 **‘제목 - 내용’** 형식을 쓴다(‘제목:’ ‘내용:’ 줄바꿈 형태도 가능).",
        "**내용**에는 (1) 반드시 **영어 원문 문장 또는 핵심 표현을 인용**하고 (2) 이어서 한국어로 요점을 설명한다. 영어 인용과 한국어 설명의 구분이 보이게 쓴다.",
        "가능하면 같은 모듈 「지문」에 나온 표현을 그대로 인용하고, 지문이 없으면 다른 칸과 모순되지 않게 요약한다.",
        "두세 단어 수준의 짧은 표현이라도 **영어 병기**를 생략하지 말 것.",
      ].join(" ");
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
  const fieldExtra =
    field === "passageAnalysis"
      ? "\n\n[중요] 참고 블록의 「지문」에 적힌 문장을 **전부** 문장 단위로 쪼개어 위 네 항목(영문·해석·함축적 의미·핵심표현 분석) 형식으로만 출력한다. 통째 요약으로 대체하지 말 것."
      : field === "keySummary"
        ? "\n\n[중요] 항목마다 **제목 - 내용** 구조를 지키고, **내용**에 영어 원문/표현 병기 후 한국어 설명을 덧붙인다."
        : "";

  const userContent = `교재 제목(참고): ${bookTitle.trim() || "교재"}
단원: 제 ${unitIndex + 1}단원
모듈: 화면의 모듈 ${moduleOrdinal}

같은 모듈의 다른 항목(참고):
---
${context}
---

요청 항목: 「${label}」
작성 지침: ${guide}${fieldExtra}

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
            "당신은 한국어·영어 교재 편집자입니다. 사용자가 요청한 칸 하나만 작성합니다. content 문자열 안에서는 줄바꿈이 필요하면 그대로 넣어도 됩니다. JSON {\"content\":\"...\"} 만 출력하고 다른 키는 넣지 마세요.",
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
