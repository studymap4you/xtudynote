import { SIGNAL_LOGIC_OPENAI_MODEL_FALLBACK } from "@/config/signalLogicAnalysisPrompt";
import type { KnowledgeCurationItem } from "@/types/knowledgeCuration";

function readOpenAiKey(): string {
  return String(import.meta.env.VITE_OPENAI_API_KEY ?? "").trim();
}

function readOpenAiModel(): string {
  const m = String(import.meta.env.VITE_OPENAI_MODEL ?? "").trim();
  return m || SIGNAL_LOGIC_OPENAI_MODEL_FALLBACK;
}

function itemsBlock(items: KnowledgeCurationItem[]): string {
  return items
    .map((it, i) => {
      const sn = it.snippet ? `\n   요약: ${it.snippet.slice(0, 500)}` : "";
      return `${i + 1}. [${it.type}] ${it.title}\n   URL: ${it.url}${sn}`;
    })
    .join("\n\n");
}

/**
 * 저장된 큐레이션 항목을 바탕으로 마크다운 형태 학습자료 초안 생성 (OpenAI JSON → 본문)
 */
export async function generateKnowledgeMaterialMarkdown(input: {
  curationTitle: string;
  topicDomain: string;
  items: KnowledgeCurationItem[];
  extraInstructions?: string;
}): Promise<string> {
  const apiKey = readOpenAiKey();
  if (!apiKey) {
    throw new Error("OpenAI API 키가 없습니다. .env.local에 VITE_OPENAI_API_KEY를 설정하세요.");
  }
  const model = readOpenAiModel();
  const { curationTitle, topicDomain, items, extraInstructions } = input;
  if (items.length === 0) {
    throw new Error("큐레이션에 저장된 항목이 없습니다.");
  }

  const user = `다음은 "${curationTitle}"(분야: ${topicDomain}) 큐레이션에 모은 참고 자료 목록입니다.

참고 목록:
${itemsBlock(items)}

${extraInstructions?.trim() ? `추가 지시:\n${extraInstructions.trim()}\n\n` : ""}

JSON으로만 응답하세요. 키는 정확히 하나: "markdown" (string). 값은 한국어 중심 마크다운 학습자료 초안입니다.
구조 예시: "# 학습 주제", "## 학습 목표", "## 핵심 개념", "## 자료별 활용 가이드", "## 토의·과제 아이디어", "## 참고 링크 목록" 등을 포함하고,
각 참고 자료(유튜브·논문·뉴스)를 수업에서 어떻게 쓸지 짧게 안내하세요.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.45,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a curriculum designer for Korean adult/pro students. Output one JSON object with key 'markdown' only.",
        },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `OpenAI 요청 실패 (${res.status})`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI 응답이 비었습니다.");
  let parsed: { markdown?: string };
  try {
    parsed = JSON.parse(content) as { markdown?: string };
  } catch {
    throw new Error("AI 응답 JSON 파싱 실패");
  }
  const md = String(parsed.markdown ?? "").trim();
  if (!md) throw new Error("markdown 필드가 비었습니다.");
  return md.slice(0, 120_000);
}
