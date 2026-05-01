import type { NewsletterAiResult, NewsletterPurpose } from "@/types/newsletter";

function readOpenAiKey(): string {
  return String(import.meta.env.VITE_OPENAI_API_KEY ?? "").trim();
}

function visionModel(): string {
  const m = String(import.meta.env.VITE_OPENAI_VISION_MODEL ?? "").trim();
  return m || "gpt-4o";
}

const MAX_PDF_TEXT_PER_FILE = 28_000;
const MAX_TOTAL_PDF_TEXT = 56_000;

const NEWSLETTER_JSON_INSTRUCTION = `You are the editorial AI for Xtudy-Universe (English reading & Binary Logic / Signal Logic learning platform for Korean students).

Analyze the uploaded content: one or more images (passages, worksheets, handwritten marks) and/or plain text extracted from PDF file(s). Images may show English learning materials, underlines, circles, margin notes. PDF text may duplicate or extend what is visible in images.

Respond with a SINGLE JSON object (no markdown fences) exactly in this shape:
{
  "titleKo": string,
  "sections": [
    { "id": string, "headingKo": string, "bodyKo": string }
  ]
}

You MUST include these section ids in order (you may add one extra closing section with id "closing" at the end):
1) "opening" — Hook aligned with the newsletter purpose; mention Xtudy-Universe briefly.
2) "fromImage" — What the sources show: from images and/or PDF text—theme, notes, study guidance (evidence-based; if unclear, say what is uncertain).
3) "binaryLogic" — MAIN SECTION. Fixed tone: this is the core of our product. Explain **Binary Logic / Signal Logic (시그널 로직)** in plain Korean for parents or students: one-shot pivot signals, binary oppositions (A vs B poles), reading the author's argumentative move—not word-by-word translation. Relate briefly to what the materials suggest (e.g. contrasts or markers the teacher highlighted). 3–6 short paragraphs in bodyKo (use \\n\\n between paragraphs inside the string).
4) "keywords" — Weave in the user-supplied keywords naturally with practical study tips.
5) "closing" — Short CTA to explore Logic Dashboard / 지문 학습 on Xtudy-Universe.

Rules:
- All human-facing copy in Korean (headingKo, bodyKo, titleKo).
- binaryLogic.bodyKo must be substantive (not generic filler): reflect real Signal Logic / binary analysis concepts used in KSAT-style English reading.
- Do not invent exact quotes unless clearly legible in an image or present in the PDF excerpt; paraphrase if needed.
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
    r.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    r.readAsDataURL(file);
  });
}

function buildPdfContext(docs: { fileName: string; text: string }[]): string {
  if (!docs.length) return "";
  let total = 0;
  const parts: string[] = [
    "",
    "다음은 PDF에서 추출한 본문입니다. 위 이미지(들)와 함께 근거로 활용하세요.",
    "",
  ];
  for (const p of docs) {
    let t = p.text.trim();
    if (!t) continue;
    if (t.length > MAX_PDF_TEXT_PER_FILE) {
      t =
        t.slice(0, MAX_PDF_TEXT_PER_FILE) +
        "\n[… 이 PDF는 길어 일부만 포함했습니다.]";
    }
    const chunk = `### ${p.fileName}\n${t}`;
    if (total + chunk.length > MAX_TOTAL_PDF_TEXT) {
      const room = MAX_TOTAL_PDF_TEXT - total;
      if (room > 400) {
        parts.push(`### ${p.fileName}\n${chunk.slice(0, room)}\n[… 총 PDF 분량 한도로 이하 생략]`);
      }
      break;
    }
    total += chunk.length;
    parts.push(chunk);
  }
  return parts.join("\n\n");
}

export type NewsletterPdfExcerpt = {
  fileName: string;
  text: string;
};

export type NewsletterMaterialsParams = {
  /** 비전으로 보낼 이미지 파일 (여러 장 가능) */
  imageFiles: File[];
  /** PDF에서 추출한 텍스트 (파일별) */
  pdfDocuments: NewsletterPdfExcerpt[];
  purpose: NewsletterPurpose;
  keywords: string;
  newsletterTitle?: string;
};

/** @deprecated 단일 이미지 전용 — 내부적으로 requestNewsletterFromMaterials 사용 */
export type NewsletterVisionParams = {
  imageFile: File;
  purpose: NewsletterPurpose;
  keywords: string;
  newsletterTitle?: string;
};

function normalizeNewsletterJson(content: string): NewsletterAiResult {
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

  return { titleKo, sections: sorted };
}

/**
 * 이미지(다중) + PDF 추출 텍스트를 함께 보내 뉴스레터 JSON을 생성합니다.
 * PDF만 있는 경우 텍스트 전용 user 메시지로 요청합니다.
 */
export async function requestNewsletterFromMaterials(
  params: NewsletterMaterialsParams,
): Promise<{ data: NewsletterAiResult; model: string }> {
  const apiKey = readOpenAiKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API 키가 없습니다. .env.local에 VITE_OPENAI_API_KEY를 설정한 뒤 개발 서버를 다시 실행하세요.",
    );
  }
  const model = visionModel();
  const purposeLine = PURPOSE_LABEL[params.purpose];
  const kw = params.keywords.trim();
  const titleHint = params.newsletterTitle?.trim();
  const pdfBlock = buildPdfContext(params.pdfDocuments);

  const userText = [
    `뉴스레터 목적: ${purposeLine}`,
    titleHint ? `제목 힌트(운영자 입력): ${titleHint}` : null,
    kw ? `반드시 자연스럽게 녹여낼 키워드: ${kw}` : "키워드: (없음)",
    params.imageFiles.length
      ? `첨부 이미지: ${params.imageFiles.length}개 (모두 검토).`
      : "첨부 이미지: 없음 (PDF 텍스트만 있을 수 있음).",
    pdfBlock,
    "",
    "위 지시에 맞춰 JSON만 출력하세요.",
  ]
    .filter(Boolean)
    .join("\n");

  const imageParts: { type: "image_url"; image_url: { url: string; detail: "high" } }[] = [];
  for (const f of params.imageFiles) {
    const dataUrl = await fileToDataUrl(f);
    imageParts.push({ type: "image_url", image_url: { url: dataUrl, detail: "high" } });
  }

  const userMessage =
    imageParts.length > 0
      ? {
          role: "user" as const,
          content: [{ type: "text" as const, text: userText }, ...imageParts],
        }
      : {
          role: "user" as const,
          content: userText,
        };

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
      messages: [{ role: "system", content: NEWSLETTER_JSON_INSTRUCTION }, userMessage],
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

  return { data: normalizeNewsletterJson(content), model };
}

export async function requestNewsletterFromImage(
  params: NewsletterVisionParams,
): Promise<{ data: NewsletterAiResult; model: string }> {
  return requestNewsletterFromMaterials({
    imageFiles: [params.imageFile],
    pdfDocuments: [],
    purpose: params.purpose,
    keywords: params.keywords,
    newsletterTitle: params.newsletterTitle,
  });
}
