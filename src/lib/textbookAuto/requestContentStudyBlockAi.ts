import {
  TEXTBOOK_CONTENT_STUDY_BLOCK_SYSTEM,
  buildContentStudyBulletsUserPrompt,
  buildContentStudyFullBlockUserPrompt,
  readOpenAiModelForContentStudy,
} from "@/config/textbookAutoContentStudyPrompt";

function readOpenAiKey(): string {
  return String(import.meta.env.VITE_OPENAI_API_KEY ?? "").trim();
}

function normalizeBulletLines(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === "string") {
      const t = x.trim();
      if (t) out.push(t);
    }
    if (out.length >= max) break;
  }
  return out;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export type ContentStudyBlockAiMeta = { model: string };

async function openAiJsonObject(userContent: string): Promise<unknown> {
  const apiKey = readOpenAiKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API 키가 없습니다. .env.local에 VITE_OPENAI_API_KEY를 설정한 뒤 개발 서버를 다시 실행하세요.",
    );
  }
  const model = readOpenAiModelForContentStudy();
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
        { role: "system", content: TEXTBOOK_CONTENT_STUDY_BLOCK_SYSTEM },
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

  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error("AI 응답 JSON 파싱에 실패했습니다.");
  }
}

/** 제목+불릿을 원문에서 새로 제안 (추가 블록용) */
export async function requestContentStudyFullBlock(params: {
  bookTitle: string;
  unitTitle: string;
  sourceText: string;
  existingBlockTitles: string[];
}): Promise<{ title: string; bullets: string[]; meta: ContentStudyBlockAiMeta }> {
  const userContent = buildContentStudyFullBlockUserPrompt(params);
  const parsed = await openAiJsonObject(userContent);
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("AI 응답 형식이 올바르지 않습니다.");
  }
  const o = parsed as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  const bullets = normalizeBulletLines(o.bullets, 20);
  if (!title) throw new Error("AI가 제목을 비우고 응답했습니다.");
  if (bullets.length === 0) throw new Error("AI가 불릿을 비우고 응답했습니다.");
  return { title, bullets, meta: { model: readOpenAiModelForContentStudy() } };
}

/** 입력된 소제목에 맞추어 불릿만 생성 */
export async function requestContentStudyBulletsForTitle(params: {
  bookTitle: string;
  unitTitle: string;
  sourceText: string;
  blockTitle: string;
}): Promise<{ bullets: string[]; meta: ContentStudyBlockAiMeta }> {
  const userContent = buildContentStudyBulletsUserPrompt(params);
  const parsed = await openAiJsonObject(userContent);
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("AI 응답 형식이 올바르지 않습니다.");
  }
  const o = parsed as Record<string, unknown>;
  const bullets = normalizeBulletLines(o.bullets, 24);
  if (bullets.length === 0) throw new Error("AI가 불릿을 비우고 응답했습니다.");
  return { bullets, meta: { model: readOpenAiModelForContentStudy() } };
}
