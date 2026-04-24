import {
  SIGNAL_LOGIC_OPENAI_MODEL_FALLBACK,
  SIGNAL_LOGIC_SYSTEM_PROMPT,
  buildSignalLogicUserPrompt,
} from "@/config/signalLogicAnalysisPrompt";
import { normalizeAnalysisReport } from "@/lib/signalLogic/normalizeAnalysisReport";
import type { SignalLogicAnalysisReportJson } from "@/types/signalLogicAnalysisReport";

function readOpenAiKey(): string {
  return String(import.meta.env.VITE_OPENAI_API_KEY ?? "").trim();
}

function readOpenAiModel(): string {
  const m = String(import.meta.env.VITE_OPENAI_MODEL ?? "").trim();
  return m || SIGNAL_LOGIC_OPENAI_MODEL_FALLBACK;
}

export type AnalysisRequestMeta = {
  model: string;
};

/**
 * OpenAI Chat Completions (JSON mode). API 키는 VITE_OPENAI_API_KEY.
 */
export async function requestSignalLogicAnalysis(passage: string): Promise<{
  report: SignalLogicAnalysisReportJson;
  meta: AnalysisRequestMeta;
}> {
  const apiKey = readOpenAiKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API 키가 없습니다. .env.local에 VITE_OPENAI_API_KEY를 설정한 뒤 개발 서버를 다시 실행하세요.",
    );
  }
  const model = readOpenAiModel();
  const userContent = buildSignalLogicUserPrompt(passage);

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
        { role: "system", content: SIGNAL_LOGIC_SYSTEM_PROMPT },
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

  return { report: normalizeAnalysisReport(parsed), meta: { model } };
}
