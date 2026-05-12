import {
  TEXTBOOK_ANSWER_KEY_MODEL_FALLBACK,
  TEXTBOOK_ANSWER_KEY_SYSTEM,
  buildTextbookAnswerKeyUserPrompt,
} from "@/config/textbookAutoAnswerKeyPrompt";
import type { TextbookAnswerKeyItem, TextbookAnswerKeyStub } from "@/types/textbookAuto";
import { parseStubId } from "@/lib/textbookAuto/buildAnswerKeyStubs";

function readOpenAiKey(): string {
  return String(import.meta.env.VITE_OPENAI_API_KEY ?? "").trim();
}

function readOpenAiModel(): string {
  const m = String(import.meta.env.VITE_OPENAI_MODEL ?? "").trim();
  return m || TEXTBOOK_ANSWER_KEY_MODEL_FALLBACK;
}

function normalizeBullets(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

export type AnswerKeyGenMeta = { model: string };

/**
 * 단원 단위: 확인학습·단원평가 문항 스텁에 정답·해설(불릿) 부여. id 변경 금지를 프롬프트로 강제.
 */
export async function requestTextbookAnswerKeyForUnit(params: {
  bookTitle: string;
  unitTitle: string;
  unitIndex: number;
  stubs: TextbookAnswerKeyStub[];
  sourceExcerpt?: string;
  unitKeyContext?: string;
}): Promise<{ items: TextbookAnswerKeyItem[]; meta: AnswerKeyGenMeta }> {
  if (params.stubs.length === 0) {
    return { items: [], meta: { model: readOpenAiModel() } };
  }

  const apiKey = readOpenAiKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API 키가 없습니다. .env.local에 VITE_OPENAI_API_KEY를 설정한 뒤 개발 서버를 다시 실행하세요.",
    );
  }
  const model = readOpenAiModel();
  const userContent = buildTextbookAnswerKeyUserPrompt({
    bookTitle: params.bookTitle,
    unitTitle: params.unitTitle,
    unitIndexOneBased: params.unitIndex + 1,
    stubs: params.stubs,
    sourceExcerpt: params.sourceExcerpt,
    unitKeyContext: params.unitKeyContext,
  });

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
        { role: "system", content: TEXTBOOK_ANSWER_KEY_SYSTEM },
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
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI 응답에 본문이 없습니다.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error("AI 응답 JSON 파싱에 실패했습니다.");
  }

  const itemsRaw =
    parsed !== null && typeof parsed === "object" && "items" in parsed && Array.isArray((parsed as { items: unknown }).items)
      ? (parsed as { items: unknown[] }).items
      : [];

  const byId = new Map<string, { answer: string; explanationBullets: string[] }>();
  for (const row of itemsRaw) {
    if (row === null || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    if (!id) continue;
    const answer = typeof r.answer === "string" ? r.answer.trim() : "";
    byId.set(id, { answer: answer || "—", explanationBullets: normalizeBullets(r.explanationBullets) });
  }

  const out: TextbookAnswerKeyItem[] = [];
  for (const stub of params.stubs) {
    const meta = parseStubId(stub.id);
    if (!meta) continue;
    const got = byId.get(stub.id);
    const answer = got?.answer ?? "—";
    const explanationBullets =
      got?.explanationBullets?.length ? got.explanationBullets : ["AI 해설을 가져오지 못했습니다. 다시 시도하세요."];
    out.push({
      id: stub.id,
      unitIndex: meta.unitIndex,
      bucket: meta.bucket,
      orderIndex: meta.orderIndex,
      question: stub.question,
      answer,
      explanationBullets,
    });
  }

  return { items: out, meta: { model } };
}
