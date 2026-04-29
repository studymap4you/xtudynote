import type { NewsletterAiResult, NewsletterPurpose } from "@/types/newsletter";

function readOpenAiKey(): string {
  return String(import.meta.env.VITE_OPENAI_API_KEY ?? "").trim();
}

function visionModel(): string {
  const m = String(import.meta.env.VITE_OPENAI_VISION_MODEL ?? "").trim();
  return m || "gpt-4o";
}

const NEWSLETTER_JSON_INSTRUCTION = `You are the editorial AI for Xtudy-Universe (English reading & Binary Logic / Signal Logic learning platform for Korean students).

Analyze the uploaded image. It may contain an English learning passage, worksheet, and/or teacher's handwritten marks (underlines, circles, checkmarks, margin notes).

Respond with a SINGLE JSON object (no markdown fences) exactly in this shape:
{
  "titleKo": string,
  "sections": [
    { "id": string, "headingKo": string, "bodyKo": string }
  ]
}

You MUST include these section ids in order (you may add one extra closing section with id "closing" at the end):
1) "opening" — Hook aligned with the newsletter purpose; mention Xtudy-Universe briefly.
2) "fromImage" — What you see in the image: passage theme, visible teacher notes/handwriting habits, and how they guide study (evidence-based; if unclear, say what is uncertain).
3) "binaryLogic" — MAIN SECTION. Fixed tone: this is the core of our product. Explain **Binary Logic / Signal Logic (시그널 로직)** in plain Korean for parents or students: one-shot pivot signals, binary oppositions (A vs B poles), reading the author's argumentative move—not word-by-word translation. Relate briefly to what the image suggests (e.g. which contrasts or markers the teacher highlighted). 3–6 short paragraphs in bodyKo (use \\n\\n between paragraphs inside the string).
4) "keywords" — Weave in the user-supplied keywords naturally with practical study tips.
5) "closing" — Short CTA to explore Logic Dashboard / 지문 학습 on Xtudy-Universe.

Rules:
- All human-facing copy in Korean (headingKo, bodyKo, titleKo).
- binaryLogic.bodyKo must be substantive (not generic filler): reflect real Signal Logic / binary analysis concepts used in KSAT-style English reading.
- Do not invent exact quotes from the passage unless clearly legible in the image; paraphrase if needed.
- Keep JSON valid; escape newlines in strings as \\n.`;

const PURPOSE_LABEL: Record<NewsletterPurpose, string> = {
  parent_monthly: "월간 학부모 뉴스레터",
  teacher_tip: "교사·튜터 대상 팁",
  student_motivation: "학습자 동기·루틴 강조",
  brand_story: "브랜드·서비스 소개 톤",
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    r.readAsDataURL(file);
  });
}

export type NewsletterVisionParams = {
  imageFile: File;
  purpose: NewsletterPurpose;
  keywords: string;
  newsletterTitle?: string;
};

export async function requestNewsletterFromImage(
  params: NewsletterVisionParams,
): Promise<{ data: NewsletterAiResult; model: string }> {
  const apiKey = readOpenAiKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API 키가 없습니다. .env.local에 VITE_OPENAI_API_KEY를 설정한 뒤 개발 서버를 다시 실행하세요.",
    );
  }
  const model = visionModel();
  const dataUrl = await fileToDataUrl(params.imageFile);
  const purposeLine = PURPOSE_LABEL[params.purpose];
  const kw = params.keywords.trim();
  const titleHint = params.newsletterTitle?.trim();

  const userText = [
    `뉴스레터 목적: ${purposeLine}`,
    titleHint ? `제목 힌트(운영자 입력): ${titleHint}` : null,
    kw ? `반드시 자연스럽게 녹여낼 키워드: ${kw}` : "키워드: (없음)",
    "",
    "위 지시에 맞춰 JSON만 출력하세요.",
  ]
    .filter(Boolean)
    .join("\n");

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
        { role: "system", content: NEWSLETTER_JSON_INSTRUCTION },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
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
    throw new Error("AI 응답에 본문이 없습니다.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error("AI JSON 파싱에 실패했습니다.");
  }

  const obj = parsed as Record<string, unknown>;
  const titleKo = String(obj.titleKo ?? "").trim() || "Xtudy-Universe 뉴스레터";
  const rawSecs = obj.sections;
  const sections: NewsletterAiResult["sections"] = [];
  if (Array.isArray(rawSecs)) {
    for (const row of rawSecs) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = String(r.id ?? "").trim() || `sec-${sections.length}`;
      const headingKo = String(r.headingKo ?? "").trim();
      const bodyKo = String(r.bodyKo ?? "").trim();
      if (!headingKo || !bodyKo) continue;
      sections.push({ id, headingKo, bodyKo });
    }
  }

  const required = ["opening", "fromImage", "binaryLogic", "keywords", "closing"];
  const ids = new Set(sections.map((s) => s.id));
  for (const rid of required) {
    if (!ids.has(rid)) {
      throw new Error(`AI 응답에 필수 섹션 "${rid}"가 없습니다. 다시 시도해 주세요.`);
    }
  }

  const order = [...required, ...sections.map((s) => s.id).filter((id) => !required.includes(id))];
  const uniqueOrder = [...new Set(order)];
  const map = new Map(sections.map((s) => [s.id, s]));
  const sorted = uniqueOrder
    .map((id) => map.get(id))
    .filter((s): s is NewsletterAiResult["sections"][number] => !!s);

  return { data: { titleKo, sections: sorted }, model };
}
