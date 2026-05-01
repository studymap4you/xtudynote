import type {
  NewsletterAiResult,
  NewsletterImageLayout,
  NewsletterPurpose,
  NewsletterSection,
} from "@/types/newsletter";

function readOpenAiKey(): string {
  return String(import.meta.env.VITE_OPENAI_API_KEY ?? "").trim();
}

function visionModel(): string {
  const m = String(import.meta.env.VITE_OPENAI_VISION_MODEL ?? "").trim();
  return m || "gpt-4o";
}

const MAX_PDF_TEXT_PER_FILE = 28_000;
const MAX_TOTAL_PDF_TEXT = 56_000;


function newsletterSystemPrompt(imageCount: number): string {
  const pairRules =
    imageCount > 0
      ? `
When ${imageCount} image(s) are attached (vision), you MUST include EXACTLY these section ids after "opening" and BEFORE "binaryLogic", in this numeric order:
${Array.from({ length: imageCount }, (_, i) => `pair_${i}`).join(", ")}

For EACH pair_k section (k = 0..${imageCount - 1}):
- That section corresponds to the (k+1)-th attached image in the same order the user uploaded.
- Provide headingKo + bodyKo as ONE newsletter module: **image-then-text rhythm in reading order** — headingKo is a short news-style headline; bodyKo is 2–5 short paragraphs (use \\n\\n between paragraphs).
- **Informational newsletter writing (MANDATORY)**: Teach the reader something useful (methods, pitfalls, how to practice, what the material implies for KSAT English / reading). Give concrete guidance parents or students can act on.
- **FORBIDDEN**: Do NOT write like a photo caption or vision summary. Banned patterns include: "이 이미지는", "사진에서", "첨부 이미지에서", "그림을 보면", "위 이미지는", "보시는 바와 같이", similar meta description of the picture. Use third-person news/editorial tone about **the topic**, not about the image artifact.
- Do NOT invent exact quotes unless clearly legible; paraphrase.

Do NOT include a section with id "fromImage" when any images are attached (the pair_* sections replace it).
`
      : `
Include section id "fromImage" after "opening": summarize insights grounded ONLY in PDF-extracted text (no invented quotes). Same informational newsletter style — no filler.
`;

  return `You are the editorial AI for Xtudy-Universe (English reading & Binary Logic / Signal Logic learning platform for Korean students).

Analyze uploaded content: images (passages, worksheets, notes) via vision and/or plain text from PDFs.

Respond with a SINGLE JSON object (no markdown fences) exactly in this shape:
{
  "titleKo": string,
  "sections": [
    { "id": string, "headingKo": string, "bodyKo": string, "imageLayout"?: "block" | "left" | "right" }
  ]
}

Optional per-section "imageLayout" applies only if that section will carry an image (pair_* from client). Prefer "right" or "left" so text wraps beside the image like a magazine; use "block" if a full-width figure fits better.

You MUST include these section ids in order:
1) "opening" — Hook aligned with the newsletter purpose; mention Xtudy-Universe briefly. Informational tone.
${imageCount > 0 ? `2) pair_0 .. pair_${imageCount - 1} — one per attached image (see rules below).` : `2) "fromImage" — PDF/text-based insights (no images attached).`}
3) "binaryLogic" — MAIN SECTION. Core product: **Binary Logic / Signal Logic (시그널 로직)** in plain Korean for parents or students: pivot signals, binary oppositions (A vs B), reading the author's move—not word-by-word translation. Tie briefly to the materials. 3–6 short paragraphs in bodyKo (use \\n\\n between paragraphs).
4) "keywords" — Weave user-supplied keywords with practical study tips.
5) "closing" — Short CTA (Logic Dashboard / 지문 학습).

${pairRules}
Rules:
- All human-facing copy in Korean (headingKo, bodyKo, titleKo).
- binaryLogic.bodyKo must be substantive (real Signal Logic concepts for KSAT-style reading).
- Keep JSON valid; escape newlines in strings as \\n.`;
}

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

function parseImageLayout(v: unknown): NewsletterImageLayout | undefined {
  if (v === "left" || v === "right" || v === "block") return v;
  return undefined;
}

function normalizeNewsletterJson(content: string, imageCount: number): NewsletterAiResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error("AI JSON 파싱에 실패했습니다.");
  }

  const obj = parsed as Record<string, unknown>;
  const titleKo = String(obj.titleKo ?? "").trim() || "Xtudy-Universe 뉴스레터";
  const rawSecs = obj.sections;
  const sections: NewsletterSection[] = [];
  if (Array.isArray(rawSecs)) {
    for (const row of rawSecs) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = String(r.id ?? "").trim() || `sec-${sections.length}`;
      const headingKo = String(r.headingKo ?? "").trim();
      const bodyKo = String(r.bodyKo ?? "").trim();
      if (!headingKo || !bodyKo) continue;
      const rawPct = r.imageWidthPercent;
      let imageWidthPercent: number | undefined;
      if (typeof rawPct === "number" && Number.isFinite(rawPct)) {
        imageWidthPercent = Math.min(100, Math.max(25, Math.round(rawPct)));
      }
      sections.push({
        id,
        headingKo,
        bodyKo,
        imageLayout: parseImageLayout(r.imageLayout),
        imageWidthPercent,
      });
    }
  }

  const requiredCore = ["opening", "binaryLogic", "keywords", "closing"];
  const ids = new Set(sections.map((s) => s.id));
  for (const rid of requiredCore) {
    if (!ids.has(rid)) {
      throw new Error(`AI 응답에 필수 섹션 "${rid}"가 없습니다. 다시 시도해 주세요.`);
    }
  }

  if (imageCount > 0) {
    for (let i = 0; i < imageCount; i++) {
      const pid = `pair_${i}`;
      if (!ids.has(pid)) {
        throw new Error(
          `AI 응답에 첨부 이미지 ${imageCount}장에 맞는 "${pid}" 섹션이 없습니다. 다시 생성해 주세요.`,
        );
      }
    }
  } else if (!ids.has("fromImage")) {
    throw new Error(`AI 응답에 필수 섹션 "fromImage"가 없습니다. 다시 시도해 주세요.`);
  }

  const baseOrder =
    imageCount > 0
      ? (["opening", ...Array.from({ length: imageCount }, (_, i) => `pair_${i}`), "binaryLogic", "keywords", "closing"] as const)
      : (["opening", "fromImage", "binaryLogic", "keywords", "closing"] as const);

  const map = new Map(sections.map((s) => [s.id, s]));
  const sorted: NewsletterSection[] = [];
  for (const id of baseOrder) {
    const s = map.get(id);
    if (!s) {
      throw new Error(`섹션 "${id}"를 찾을 수 없습니다.`);
    }
    sorted.push(s);
  }

  return { titleKo, sections: sorted };
}

async function attachPairImages(data: NewsletterAiResult, imageFiles: File[]): Promise<NewsletterAiResult> {
  if (!imageFiles.length) return data;
  const sections = await Promise.all(
    data.sections.map(async (s) => {
      const m = /^pair_(\d+)$/.exec(s.id);
      if (!m) return s;
      const idx = Number(m[1]);
      if (!Number.isFinite(idx) || idx < 0 || idx >= imageFiles.length) {
        return s;
      }
      const url = await fileToDataUrl(imageFiles[idx]);
      const layout: NewsletterImageLayout =
        s.imageLayout === "left" || s.imageLayout === "right" || s.imageLayout === "block"
          ? s.imageLayout
          : "right";
      const imageWidthPercent =
        s.imageWidthPercent ?? (layout === "block" ? 100 : 40);
      return { ...s, imageDataUrl: url, imageLayout: layout, imageWidthPercent };
    }),
  );
  return { ...data, sections };
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
      messages: [{ role: "system", content: newsletterSystemPrompt(params.imageFiles.length) }, userMessage],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `OpenAI 요청 실패 (${res.status})`);
  }

  const raw = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = raw.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI 응답에 본문이 없습니다.");
  }

  const parsed = normalizeNewsletterJson(content, params.imageFiles.length);
  const result =
    params.imageFiles.length > 0 ? await attachPairImages(parsed, params.imageFiles) : parsed;

  return { data: result, model };
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
