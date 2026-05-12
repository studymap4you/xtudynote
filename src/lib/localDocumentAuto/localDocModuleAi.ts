/** 학습지 모듈 — 주제·요지 / 직독직해 AI 채움 (VITE_OPENAI_API_KEY) */

function readOpenAiKey(): string {
  return String(import.meta.env.VITE_OPENAI_API_KEY ?? "").trim();
}

function readOpenAiModel(): string {
  const m = String(import.meta.env.VITE_OPENAI_MODEL ?? "").trim();
  return m || "gpt-4o-mini";
}

const TOPIC_GIST_SYSTEM = `You are a Korean high-school reading tutor. The user pastes an English passage block and question context.
Return ONLY valid JSON (no markdown fences), one object:
{"topic":"한 줄 주제(한국어)","title":"한 줄 제목 후보(한국어)","gist":"2~4문장 요지(한국어)"}
Rules:
- All values in Korean except proper nouns if needed.
- If the passage is unclear, still give best-effort concise entries.
- topic = core subject matter in one short phrase; title = a polished one-line title; gist = main point / summary.`;

const LITERAL_SYSTEM = `You are a Korean English reading tutor. The user provides an English passage (and optional Korean questions).
Return ONLY plain text (no JSON, no markdown fences): a "직독직해" section in Korean education style—phrase or line breaks with Korean gloss/meaning for the English, readable on paper.
Use Korean for explanations. Keep the English phrases/words you gloss visible enough that a student can follow.`;

async function chatJson(model: string, apiKey: string, system: string, user: string): Promise<string> {
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
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `OpenAI 요청 실패 (${res.status})`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return String(data.choices?.[0]?.message?.content ?? "").trim();
}

async function chatText(model: string, apiKey: string, system: string, user: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `OpenAI 요청 실패 (${res.status})`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return String(data.choices?.[0]?.message?.content ?? "").trim();
}

function buildContext(prefix: string, context: string): string {
  const c = context.trim();
  if (c.length < 20) {
    throw new Error("문제·지문 등 참고 텍스트가 너무 짧습니다. 「모듈 구성」에서 문제 본문이 있는지 확인해 주세요.");
  }
  return `${prefix}\n"""${c.slice(0, 28_000)}"""`;
}

export async function requestTopicGistModuleAi(passageContext: string): Promise<string> {
  const apiKey = readOpenAiKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API 키가 없습니다. .env.local에 VITE_OPENAI_API_KEY를 설정한 뒤 개발 서버를 다시 실행하세요.",
    );
  }
  const model = readOpenAiModel();
  const raw = await chatJson(
    model,
    apiKey,
    TOPIC_GIST_SYSTEM,
    buildContext(
      "아래는 한 문항의 「문제·지문·선택지」 블록 전체입니다. 이 지문·문항만 근거로 JSON만 출력하세요.",
      passageContext,
    ),
  );
  let o: { topic?: string; title?: string; gist?: string };
  try {
    o = JSON.parse(raw) as { topic?: string; title?: string; gist?: string };
  } catch {
    throw new Error("AI 응답 JSON을 해석하지 못했습니다.");
  }
  const topic = String(o.topic ?? "").trim();
  const title = String(o.title ?? "").trim();
  const gist = String(o.gist ?? "").trim();
  const lines: string[] = [];
  if (topic) lines.push(`[주제] ${topic}`);
  if (title) lines.push(`[제목] ${title}`);
  if (gist) lines.push(`[요지] ${gist}`);
  if (!lines.length) throw new Error("AI가 주제·제목·요지를 비우고 반환했습니다.");
  return lines.join("\n\n");
}

export async function requestLiteralTranslationModuleAi(passageContext: string): Promise<string> {
  const apiKey = readOpenAiKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API 키가 없습니다. .env.local에 VITE_OPENAI_API_KEY를 설정한 뒤 개발 서버를 다시 실행하세요.",
    );
  }
  const model = readOpenAiModel();
  const text = await chatText(
    model,
    apiKey,
    LITERAL_SYSTEM,
    buildContext(
      "아래는 한 문항의 「문제·지문·선택지」 블록입니다. 이 영어 지문을 중심으로 직독직해 본문만 출력하세요.",
      passageContext,
    ),
  );
  if (!text.trim()) throw new Error("AI가 직독직해를 비우고 반환했습니다.");
  return text.trim();
}
