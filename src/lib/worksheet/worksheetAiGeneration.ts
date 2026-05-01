/** 학습지 확인문제·핵심요약 — OpenAI (클라이언트 키: VITE_OPENAI_API_KEY, 지문 분석과 동일 패턴) */

export type WorksheetAiContext = {
  unit: string;
  objectives: string;
  studyDate: string;
  content: string;
};

function readOpenAiKey(): string {
  return String(import.meta.env.VITE_OPENAI_API_KEY ?? "").trim();
}

function readOpenAiModel(): string {
  const m = String(import.meta.env.VITE_OPENAI_MODEL ?? "").trim();
  return m || "gpt-4o-mini";
}

type QuestionItem = {
  style: "short" | "essay";
  question: string;
  answer: string;
};

const QUESTIONS_SYSTEM = `You are a Korean education worksheet designer.
Return ONLY valid JSON (one object), no markdown fences.

Schema:
{
  "items": [
    {
      "style": "short",
      "question": "문항 텍스트 (학생에게 보이는 질문만)",
      "answer": "교사 참고용 모범 답안 (간결)"
    }
  ]
}

Rules:
- You MUST output exactly as many items as requested in the user message (same count).
- ONLY subjective question types:
  - "short" = 단답형 (한두 문장 또는 짧은 구나 단어)
  - "essay" = 서술형 (설명·근거 제시 등, 답은 여러 문장일 수 있음)
- FORBIDDEN: 객관식·선택지·OX·빈칸에 보기 나열·순서 맞추기 등 객관식 형식.
- Questions and student-facing wording in Korean unless the learning content is clearly English-focused; then questions may be in English.
- Each question must be answerable from the provided learning content.
- "answer" is for the teacher only; do not repeat multiple choice letters.`;

function buildContextBlock(ctx: WorksheetAiContext): string {
  const unit = ctx.unit.trim() || "(미입력)";
  const objectives = ctx.objectives.trim() || "(미입력)";
  const studyDate = ctx.studyDate.trim() || "(미입력)";
  const content = ctx.content.trim();
  return `학습단원: ${unit}
학습목표: ${objectives}
학습일자: ${studyDate}

학습내용:
"""${content}"""`;
}

function normalizeItems(raw: unknown, expected: number): QuestionItem[] {
  const o = raw as Record<string, unknown>;
  const arr = Array.isArray(o.items) ? o.items : [];
  const out: QuestionItem[] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const style = r.style === "essay" ? "essay" : "short";
    const question = String(r.question ?? "").trim();
    const answer = String(r.answer ?? "").trim();
    if (!question || !answer) continue;
    out.push({ style, question, answer });
  }
  if (out.length < expected) {
    throw new Error(`AI가 ${expected}문항을 만들지 못했습니다 (${out.length}개). 다시 시도해 주세요.`);
  }
  return out.slice(0, expected);
}

function formatQuestionsPdf(items: QuestionItem[]): string {
  return items
    .map((it, i) => {
      const tag = it.style === "essay" ? "서술형" : "단답형";
      return `${i + 1}. [${tag}] ${it.question}`;
    })
    .join("\n\n");
}

function formatAnswersTeacher(items: QuestionItem[]): string {
  return items
    .map((it, i) => {
      const tag = it.style === "essay" ? "서술형" : "단답형";
      return `${i + 1}. [${tag}] 참고 정답: ${it.answer}`;
    })
    .join("\n\n");
}

export async function generateSubjectiveReviewQuestions(
  ctx: WorksheetAiContext,
  count: number,
): Promise<{ questionsText: string; answersText: string }> {
  const apiKey = readOpenAiKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API 키가 없습니다. .env.local에 VITE_OPENAI_API_KEY를 설정한 뒤 개발 서버를 다시 실행하세요.",
    );
  }
  const trimmed = ctx.content.trim();
  if (trimmed.length < 40) {
    throw new Error("학습내용을 더 길게 입력한 뒤 AI 확인문제 생성을 사용해 주세요.");
  }

  const n = Math.min(20, Math.max(1, Math.floor(count)));
  const model = readOpenAiModel();

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
        { role: "system", content: QUESTIONS_SYSTEM },
        {
          role: "user",
          content: `${buildContextBlock(ctx)}\n\n위 학습내용을 바탕으로 주관식 확인문항을 정확히 ${n}개 작성하세요.`,
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
  if (!content) throw new Error("AI 응답에 본문이 없습니다.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error("AI 응답 JSON 파싱에 실패했습니다.");
  }

  const items = normalizeItems(parsed, n);
  return {
    questionsText: formatQuestionsPdf(items),
    answersText: formatAnswersTeacher(items),
  };
}

const SUMMARY_SYSTEM = `You are an assistant compiling a concise professional summary in Korean for a lesson worksheet.

Output plain text only (no JSON, no markdown # headings).

Structure: repeat this pattern for 3–6 sections as appropriate:

■ [짧은 제목]
내용 본문 (2~5문장 또는 간단한 불릿 가능). 한 덩어리가 끝나면 빈 줄.

Rules:
- 제목 줄은 반드시 ■ 로 시작.
- 일목요연하게 핵심만. 전문 보고서 톤, 과장·감상 없음.
- 학습내용에 근거한 요약만.`;

function imageMimeOk(mime: string): boolean {
  return /^image\/(png|jpeg|jpg|gif|webp)$/i.test(mime);
}

function resolveImageMime(file: File): string {
  const fromType = (file.type || "").toLowerCase();
  if (fromType && imageMimeOk(fromType)) return fromType;
  const n = file.name.toLowerCase();
  if (/\.jpe?g$/i.test(n)) return "image/jpeg";
  if (/\.png$/i.test(n)) return "image/png";
  if (/\.gif$/i.test(n)) return "image/gif";
  if (/\.webp$/i.test(n)) return "image/webp";
  throw new Error("이미지 형식을 인식하지 못했습니다. PNG, JPEG, GIF, WEBP만 지원합니다.");
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    r.readAsDataURL(file);
  });
}

/**
 * 학습지용: 이미지에서 본문 텍스트를 추출합니다(Vision). gpt-4o-mini 등 비전 지원 모델 필요.
 */
export async function extractEducationalTextFromImageFile(file: File): Promise<string> {
  const apiKey = readOpenAiKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API 키가 없습니다. .env.local에 VITE_OPENAI_API_KEY를 설정한 뒤 개발 서버를 다시 실행하세요.",
    );
  }
  const mime = resolveImageMime(file);
  const maxBytes = 12 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error("이미지는 12MB 이하로 올려 주세요.");
  }

  const ab = await file.arrayBuffer();
  const typed = new File([ab], file.name, { type: mime });
  const dataUrl = await fileToDataUrl(typed);
  const model = readOpenAiModel();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 8192,
      messages: [
        {
          role: "system",
          content:
            "You transcribe educational materials. Output plain text only: every readable line from the image in reading order. Preserve paragraph breaks. No preamble. If there is almost no text, say (이미지에서 읽을 텍스트가 거의 없습니다.)",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "아래 이미지에 인쇄된 학습·교재 본문을 그대로 옮겨 적어 주세요. 수식·도표는 짧게 설명하거나 생략해도 됩니다.",
            },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(
      t ||
        `이미지 분석 요청 실패 (${res.status}). 모델이 비전을 지원하는지(VITE_OPENAI_MODEL을 gpt-4o-mini 또는 gpt-4o 등으로) 확인해 주세요.`,
    );
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("이미지에서 본문을 추출하지 못했습니다.");
  return text;
}

export async function generateProfessionalKeySummary(ctx: WorksheetAiContext): Promise<string> {
  const apiKey = readOpenAiKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API 키가 없습니다. .env.local에 VITE_OPENAI_API_KEY를 설정한 뒤 개발 서버를 다시 실행하세요.",
    );
  }
  const trimmed = ctx.content.trim();
  if (trimmed.length < 40) {
    throw new Error("학습내용을 더 길게 입력한 뒤 AI 핵심요약을 사용해 주세요.");
  }

  const model = readOpenAiModel();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: "system", content: SUMMARY_SYSTEM },
        {
          role: "user",
          content: `${buildContextBlock(ctx)}\n\n위를 바탕으로 핵심요약을 작성하세요.`,
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
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("AI 응답에 본문이 없습니다.");
  return text;
}
