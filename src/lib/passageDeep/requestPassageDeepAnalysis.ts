import {
  PASSAGE_DEEP_SYSTEM_PROMPT,
  buildPassageDeepUserPrompt,
} from "@/config/passageDeepAnalysisPrompt";
import { SIGNAL_LOGIC_OPENAI_MODEL_FALLBACK } from "@/config/signalLogicAnalysisPrompt";
import { normalizePassageDeepReport } from "@/lib/passageDeep/normalizePassageDeepReport";
import type { PassageDeepAnalysisReportJson } from "@/types/passageDeepAnalysisReport";
import type { AnalysisRequestMeta } from "@/lib/signalLogic/requestSignalLogicAnalysis";

function readOpenAiKey(): string {
  return String(import.meta.env.VITE_OPENAI_API_KEY ?? "").trim();
}

function readOpenAiModel(): string {
  const m = String(import.meta.env.VITE_OPENAI_MODEL ?? "").trim();
  return m || SIGNAL_LOGIC_OPENAI_MODEL_FALLBACK;
}

/**
 * 지문 심층 분석 — OpenAI Chat Completions (JSON mode)
 */
export async function requestPassageDeepAnalysis(passage: string): Promise<{
  report: PassageDeepAnalysisReportJson;
  meta: AnalysisRequestMeta;
}> {
  const apiKey = readOpenAiKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API 키가 없습니다. .env.local에 VITE_OPENAI_API_KEY를 설정한 뒤 개발 서버를 다시 실행하세요.",
    );
  }
  const model = readOpenAiModel();
  const userContent = buildPassageDeepUserPrompt(passage);

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
        { role: "system", content: PASSAGE_DEEP_SYSTEM_PROMPT },
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
  if (!content) {
    throw new Error("OpenAI 응답에 본문이 없습니다.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error("AI 응답 JSON 파싱에 실패했습니다.");
  }

  return { report: normalizePassageDeepReport(parsed), meta: { model } };
}
