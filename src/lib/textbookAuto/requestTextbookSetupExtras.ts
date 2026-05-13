import { TEXTBOOK_AUTO_OPENAI_MODEL_FALLBACK } from "@/config/textbookAutoPrompt";
import type {
  SetupContentLang,
  SetupQuestionKind,
  TextbookModuleSubQuestion,
  TextbookUnitEvalQuestionSetup,
  TextbookUnitReviewStudySetup,
  TextbookUnitSourceModule,
} from "@/types/textbookAuto";
import { SOURCE_MODULE_FIELD_KEYS, SOURCE_MODULE_FIELD_LABELS } from "@/types/textbookAuto";
import { getSourceModuleFieldValue } from "@/lib/textbookAuto/combineUnitPassage";

function readOpenAiKey(): string {
  return String(import.meta.env.VITE_OPENAI_API_KEY ?? "").trim();
}

function readOpenAiModel(): string {
  const m = String(import.meta.env.VITE_OPENAI_MODEL ?? "").trim();
  return m || TEXTBOOK_AUTO_OPENAI_MODEL_FALLBACK;
}

async function openAiJsonContent(userContent: string): Promise<string> {
  const apiKey = readOpenAiKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API 키가 없습니다. .env.local에 VITE_OPENAI_API_KEY를 설정한 뒤 개발 서버를 다시 실행하세요.",
    );
  }
  const model = readOpenAiModel();
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
            '당신은 한국어·영어 교재 편집자입니다. JSON {"content":"..."} 만 출력하고 다른 키는 넣지 마세요.',
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

function moduleContextForSubQuestion(mod: TextbookUnitSourceModule, sqId: string): string {
  const lines: string[] = [];
  for (const key of SOURCE_MODULE_FIELD_KEYS) {
    const v = getSourceModuleFieldValue(mod, key).trim();
    if (!v) continue;
    lines.push(`${SOURCE_MODULE_FIELD_LABELS[key]}:\n${v}`);
  }
  mod.subQuestions.forEach((sq, i) => {
    if (sq.id === sqId) return;
    const stem = sq.stem.trim();
    const opts = sq.options.trim();
    if (!stem && !opts) return;
    lines.push(`다른 문항 ${i + 1}:\n발문: ${stem}\n선택지: ${opts}`);
  });
  return lines.join("\n\n—\n\n") || "(참고 없음)";
}

const LANG_LINE: Record<SetupContentLang, string> = {
  ko: "한국어로 작성",
  en: "영어로 작성",
};

export async function requestSubQuestionStemAi(params: {
  bookTitle: string;
  unitIndex: number;
  moduleOrdinal: number;
  mod: TextbookUnitSourceModule;
  sq: TextbookModuleSubQuestion;
}): Promise<string> {
  const { bookTitle, unitIndex, moduleOrdinal, mod, sq } = params;
  const kind: SetupQuestionKind = sq.kind;
  const lang: SetupContentLang = sq.lang;
  const role =
    kind === "mcq"
      ? `객관식 발문 1개만. ${LANG_LINE[lang]}. 정답 번호나 ①② 표기는 넣지 말 것.`
      : `주관식 서술형 질문 1개만. ${LANG_LINE[lang]}.`;
  const ctx = moduleContextForSubQuestion(mod, sq.id);
  const userContent = `교재: ${bookTitle.trim() || "교재"}
단원: 제 ${unitIndex + 1}단원
모듈 ${moduleOrdinal}

참고:
---
${ctx}
---

요청: ${role}
출력: JSON {"content":"발문만"}`;
  return openAiJsonContent(userContent);
}

export async function requestSubQuestionOptionsAi(params: {
  bookTitle: string;
  unitIndex: number;
  moduleOrdinal: number;
  mod: TextbookUnitSourceModule;
  sq: TextbookModuleSubQuestion;
}): Promise<string> {
  const { bookTitle, unitIndex, moduleOrdinal, mod, sq } = params;
  const lang: SetupContentLang = sq.lang;
  const stem = sq.stem.trim() || "(발문은 참고에 있음)";
  const ctx = moduleContextForSubQuestion(mod, sq.id);
  const userContent = `교재: ${bookTitle.trim() || "교재"}
단원: 제 ${unitIndex + 1}단원
모듈 ${moduleOrdinal}

참고:
---
${ctx}
---

발문: ${stem}

요청: 5지선다 선택지 5개. ${LANG_LINE[lang]}. 각 줄은 ① ② ③ ④ ⑤ 로 시작.
출력: JSON {"content":"선택지 본문만"}`;
  return openAiJsonContent(userContent);
}

export async function requestReviewStudyBodyAi(params: {
  bookTitle: string;
  unitIndex: number;
  passageExcerpt: string;
  setup: TextbookUnitReviewStudySetup;
}): Promise<string> {
  const { bookTitle, unitIndex, passageExcerpt, setup } = params;
  const n = setup.questionCount;
  const lang = setup.lang;
  const userContent = `교재: ${bookTitle.trim() || "교재"}
단원: 제 ${unitIndex + 1}단원

지문 발췌:
---
${passageExcerpt.slice(0, 12_000)}
---

요청: 확인학습용 질문 ${n}개. ${LANG_LINE[lang]}. 정답·해설 없이 질문만.
문항은 빈 줄로 구분. 번호는 1. 2. 형식.
출력: JSON {"content":"본문만"}`;
  return openAiJsonContent(userContent);
}

export async function requestUnitEvalStemAi(params: {
  bookTitle: string;
  unitIndex: number;
  passageExcerpt: string;
  q: TextbookUnitEvalQuestionSetup;
  ordinal: number;
}): Promise<string> {
  const { bookTitle, unitIndex, passageExcerpt, q, ordinal } = params;
  const kind = q.kind === "mcq" ? "객관식 5지선다 발문" : "주관식 단답형 발문";
  const userContent = `교재: ${bookTitle.trim() || "교재"}
단원: 제 ${unitIndex + 1}단원
단원평가 문항 ${ordinal} (${kind})

지문 발췌:
---
${passageExcerpt.slice(0, 12_000)}
---

요청: ${LANG_LINE[q.lang]}로 발문만 작성. 정답·해설·선택지 없음.
출력: JSON {"content":"발문만"}`;
  return openAiJsonContent(userContent);
}

export async function requestUnitEvalOptionsAi(params: {
  bookTitle: string;
  unitIndex: number;
  passageExcerpt: string;
  stem: string;
  q: TextbookUnitEvalQuestionSetup;
  ordinal: number;
}): Promise<string> {
  const { bookTitle, unitIndex, passageExcerpt, stem, q, ordinal } = params;
  const userContent = `교재: ${bookTitle.trim() || "교재"}
단원: 제 ${unitIndex + 1}단원
단원평가 객관식 ${ordinal}

지문 발췌:
---
${passageExcerpt.slice(0, 12_000)}
---

발문:
---
${stem}
---

요청: 5지선다 선택지 5개. ${LANG_LINE[q.lang]}. 각 줄 ①~⑤ 시작.
출력: JSON {"content":"선택지만"}`;
  return openAiJsonContent(userContent);
}
