import type { AiExamQuestion } from "@/types/aiExam";
import {
  buildExamAiSystemPrompt,
  buildExamAiUserPrompt,
  isEnglishSubject,
} from "@/lib/aiExam/examAiPrompt";

function readOpenAiKey(): string {
  return String(import.meta.env.VITE_OPENAI_API_KEY ?? "").trim();
}

function readOpenAiModel(): string {
  const m = String(import.meta.env.VITE_OPENAI_MODEL ?? "").trim();
  return m || "gpt-4o-mini";
}

type RawAiItem = {
  type?: string;
  prompt?: string;
  options?: string[];
  correctIndex?: number;
  correctAnswer?: string;
  evidenceQuote?: string;
  explanation?: string;
};

function normalizeRawItem(raw: RawAiItem): AiExamQuestion | null {
  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
  if (!prompt) return null;
  const evidenceQuote = typeof raw.evidenceQuote === "string" ? raw.evidenceQuote.trim() : "";
  const explanation = typeof raw.explanation === "string" ? raw.explanation.trim() : "";
  const type = raw.type === "short" ? "short" : "mcq";

  if (type === "mcq") {
    const opts = Array.isArray(raw.options)
      ? raw.options.map((o) => String(o ?? "").trim()).slice(0, 4)
      : [];
    while (opts.length < 4) opts.push("");
    const ci =
      typeof raw.correctIndex === "number" && raw.correctIndex >= 0 && raw.correctIndex <= 3
        ? raw.correctIndex
        : 0;
    return {
      id: crypto.randomUUID(),
      source: "ai",
      type: "mcq",
      prompt,
      options: opts,
      correctAnswer: String(ci),
      evidenceQuote: evidenceQuote || "(본문 확인)",
      explanation: explanation || "",
    };
  }

  const ca = typeof raw.correctAnswer === "string" ? raw.correctAnswer.trim() : "";
  return {
    id: crypto.randomUUID(),
    source: "ai",
    type: "short",
    prompt,
    correctAnswer: ca || "(모범답)",
    evidenceQuote: evidenceQuote || "(본문 확인)",
    explanation: explanation || "",
  };
}

/**
 * 수동 문항 뒤에 붙일 AI 문항만 생성한다.
 */
export async function generateAiExamQuestions(params: {
  passage: string;
  subject: string;
  nObjective: number;
  nSubjective: number;
  manualSummaries: string[];
}): Promise<AiExamQuestion[]> {
  const { passage, subject, nObjective, nSubjective, manualSummaries } = params;
  const totalAi = nObjective + nSubjective;
  if (totalAi <= 0) return [];

  const apiKey = readOpenAiKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API 키가 없습니다. .env.local에 VITE_OPENAI_API_KEY를 설정한 뒤 개발 서버를 다시 실행하세요.",
    );
  }

  const isEnglish = isEnglishSubject(subject);
  const sys = buildExamAiSystemPrompt(isEnglish);
  const user = buildExamAiUserPrompt({
    passage,
    subject,
    nObjective: isEnglish ? 0 : nObjective,
    nSubjective: isEnglish ? totalAi : nSubjective,
    manualSummaries,
  });

  const model = readOpenAiModel();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
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
  if (!content) throw new Error("OpenAI 응답에 본문이 없습니다.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error("AI 응답 JSON 파싱에 실패했습니다.");
  }

  const obj = parsed as { questions?: RawAiItem[] };
  const arr = Array.isArray(obj.questions) ? obj.questions : [];
  const out: AiExamQuestion[] = [];
  for (let i = 0; i < arr.length; i++) {
    const q = normalizeRawItem(arr[i] ?? {});
    if (q) out.push(q);
  }

  // 영어: 모두 short으로 통제했으므로 필터 불필요. 비영어: 목표 개수만큼 맞추기 (단순 슬라이스)
  let filtered = out;
  if (!isEnglish) {
    const wantMcq = nObjective;
    const wantShort = nSubjective;
    const mcqs = filtered.filter((q) => q.type === "mcq").slice(0, wantMcq);
    const shorts = filtered.filter((q) => q.type === "short").slice(0, wantShort);
    filtered = [...mcqs, ...shorts];
    if (filtered.length < wantMcq + wantShort) {
      const rest = out.filter((q) => !filtered.includes(q));
      for (const q of rest) {
        if (filtered.length >= wantMcq + wantShort) break;
        filtered.push(q);
      }
    }
    filtered = filtered.slice(0, wantMcq + wantShort);
  } else {
    filtered = out.filter((q) => q.type === "short").slice(0, totalAi);
  }

  return filtered;
}
