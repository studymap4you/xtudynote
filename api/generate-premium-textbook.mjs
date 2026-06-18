const TEXT_SLICE_LIMIT = 28000;
const DEFAULT_QUESTION_BATCH_SIZE = 10;
const MAX_RETRY_FOR_MISSING_QUESTIONS = 3;

const QUESTION_TYPES = ["multiple-choice", "short-answer", "blank", "essay", "matching", "ordering"];

const templates = {
  "xuniverse-premium-basic": {
    name: "XUniverse Premium Basic",
    sections: ["표지", "학습 목표", "핵심 개념", "대표 예제", "연습 문제", "정답 및 해설"],
    promptInstruction:
      "XUniverse의 고급 학습 교재처럼 학습 목표, 핵심 개념, 대표 예제, 단계별 문제, 정답 및 해설을 포함하라. 설명은 명확하고 교재 내지에 바로 배치될 수 있도록 구조화하라.",
  },
  "xuniverse-academy-pro": {
    name: "XUniverse Academy Pro",
    sections: ["개념 압축", "킬러 포인트", "대표 유형", "실전 적용", "고난도 문제", "오답 유도 포인트", "선생님 설명 노트", "정답 및 해설"],
    promptInstruction:
      "고급 학원 교재처럼 개념 압축, 킬러 포인트, 대표 유형, 실전 적용, 고난도 문제, 오답 유도 포인트, 선생님 설명 노트, 정답 및 해설을 포함하라. 설명은 강사가 수업에 바로 사용할 수 있을 정도로 구체적으로 작성하라.",
  },
};

const typeAliases = [
  { type: "multiple-choice", patterns: ["객관식", "선택형", "multiple[-\\s]?choice", "mcq", "어법"] },
  { type: "blank", patterns: ["빈칸", "blank", "fill[-\\s]?in[-\\s]?the[-\\s]?blank", "fill[-\\s]?blank"] },
  { type: "essay", patterns: ["서술형", "논술형", "essay", "writing"] },
  { type: "short-answer", patterns: ["주관식", "단답형", "short[-\\s]?answer", "short answer"] },
  { type: "matching", patterns: ["매칭", "연결", "짝짓기", "matching"] },
  { type: "ordering", patterns: ["순서", "배열", "ordering", "sequence"] },
];

const invalidQuestionPatterns = [
  /생성한\s*문항\s*수가\s*주문보다\s*부족해\s*보강된\s*문항입니다/i,
  /보강된\s*문항/i,
  /임시\s*문항/i,
  /placeholder/i,
  /filler\s*question/i,
];

function normalizeFiles(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 20).map((file) => ({
    name: String(file?.name ?? "untitled").slice(0, 240),
    type: String(file?.type ?? "unknown").slice(0, 120),
    size: Number.isFinite(Number(file?.size)) ? Number(file.size) : 0,
    lastModified: Number.isFinite(Number(file?.lastModified)) ? Number(file.lastModified) : undefined,
  }));
}

function sanitizeText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function firstNumberNear(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = Number(match[1] ?? match[2]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return undefined;
}

function clampCount(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function addTypeCount(typeCounts, type, count) {
  if (!QUESTION_TYPES.includes(type) || !Number.isFinite(count) || count <= 0) return;
  typeCounts[type] = (typeCounts[type] ?? 0) + count;
}

function parseQuestionGenerationPlan(userInstruction) {
  const normalized = userInstruction.replace(/\s+/g, " ");
  const typeCounts = {};
  const seenTypeMatches = new Set();

  const addMatchedTypeCount = (type, count, match) => {
    const key = `${type}:${match.index ?? 0}:${match[0]}`;
    if (seenTypeMatches.has(key)) return;
    seenTypeMatches.add(key);
    addTypeCount(typeCounts, type, count);
  };

  for (const alias of typeAliases) {
    for (const aliasPattern of alias.patterns) {
      const label = `(?:${aliasPattern})`;
      const beforeType = new RegExp(`(\\d+)\\s*(?:개|문제|문항|questions?)\\s*(?:의\\s*)?${label}`, "gi");
      const afterType = new RegExp(`${label}\\D{0,18}?(\\d+)\\s*(?:개|문제|문항|questions?)`, "gi");
      const englishBeforeType = new RegExp(`(\\d+)\\s+${label}\\s+questions?`, "gi");
      const englishAfterType = new RegExp(`${label}\\s+questions?\\s*[:=\\-]?\\s*(\\d+)`, "gi");
      for (const match of normalized.matchAll(beforeType)) {
        addMatchedTypeCount(alias.type, Number(match[1]), match);
      }
      for (const match of normalized.matchAll(afterType)) {
        addMatchedTypeCount(alias.type, Number(match[1]), match);
      }
      for (const match of normalized.matchAll(englishBeforeType)) {
        addMatchedTypeCount(alias.type, Number(match[1]), match);
      }
      for (const match of normalized.matchAll(englishAfterType)) {
        addMatchedTypeCount(alias.type, Number(match[1]), match);
      }
    }
  }

  const explicitTypeTotal = Object.values(typeCounts).reduce((sum, count) => sum + count, 0);
  const totalCount =
    explicitTypeTotal ||
    firstNumberNear(normalized, [
      /총\D{0,8}(\d+)\s*(?:개|문제|문항|questions?)/i,
      /(?:문제|문항)\D{0,8}(\d+)\s*(?:개|문제|문항)/i,
      /(\d+)\s*(?:개|문제|문항)\s*(?:만들|생성|출제|제작)/i,
      /(\d+)\s*questions?/i,
      /(?:create|make|generate)\D{0,12}(\d+)\s*questions?/i,
    ]) ||
    16;

  const safeTypeCounts = {};
  for (const [type, count] of Object.entries(typeCounts)) {
    safeTypeCounts[type] = clampCount(count, 0, 100);
  }

  const safeTotal = clampCount(explicitTypeTotal || totalCount, 1, 120);
  return {
    totalCount: safeTotal,
    typeCounts: Object.keys(safeTypeCounts).length > 0 ? safeTypeCounts : undefined,
    batches: [],
  };
}

function buildQuestionBatches(plan) {
  const batches = [];
  const pushChunks = (count, questionType) => {
    let remaining = count;
    while (remaining > 0) {
      const chunk = Math.min(DEFAULT_QUESTION_BATCH_SIZE, remaining);
      batches.push({ count: chunk, questionType });
      remaining -= chunk;
    }
  };

  if (plan.typeCounts) {
    for (const type of QUESTION_TYPES) {
      const count = plan.typeCounts[type] ?? 0;
      if (count > 0) pushChunks(count, type);
    }
  } else {
    pushChunks(plan.totalCount);
  }

  return batches;
}

function buildGenerationPlan(userInstruction) {
  const normalized = userInstruction.replace(/\s+/g, " ");
  const conceptPages =
    firstNumberNear(normalized, [
      /개념\s*설명\D{0,12}(\d+)\s*페이지/i,
      /개념\D{0,12}(\d+)\s*페이지/i,
      /(\d+)\s*페이지\D{0,12}개념/i,
    ]) ?? 4;
  const targetPages =
    firstNumberNear(normalized, [
      /총\s*페이지\D{0,12}(\d+)\s*페이지/i,
      /전체\D{0,12}(\d+)\s*페이지/i,
      /(\d+)\s*페이지\D{0,12}정도/i,
    ]) ?? undefined;
  const questionPlan = parseQuestionGenerationPlan(userInstruction);

  return {
    conceptPages: clampCount(conceptPages, 1, 20),
    targetPages: targetPages ? clampCount(targetPages, 4, 120) : undefined,
    questionPlan: {
      ...questionPlan,
      batches: buildQuestionBatches(questionPlan),
    },
  };
}

function deriveSourceTitle({ userInstruction, pastedText, uploadedFiles }) {
  const sourceLine = pastedText
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^#{1,6}\s*/, ""))
    .find((line) => line.length >= 4 && line.length <= 80 && !/^(page|copyright|contents?)$/i.test(line));
  if (sourceLine) return sourceLine.slice(0, 60);

  const fileTitle = uploadedFiles[0]?.name?.replace(/\.[^.]+$/, "").trim();
  if (fileTitle) return fileTitle.slice(0, 60);

  const instructionTopic = userInstruction
    .replace(/객관식\D+\d+\s*(?:개|문제|문항)/g, "")
    .replace(/주관식\D+\d+\s*(?:개|문제|문항)/g, "")
    .replace(/서술형\D+\d+\s*(?:개|문제|문항)/g, "")
    .replace(/빈칸\D+\d+\s*(?:개|문제|문항)/g, "")
    .replace(/개념\s*설명\D+\d+\s*페이지/g, "")
    .replace(/총\s*페이지\D+\d+\s*페이지/g, "")
    .split(/[.!?\n]/)
    .map((line) => line.trim())
    .find(Boolean);
  return instructionTopic?.slice(0, 60) || "XUniverse Premium Textbook";
}

function isBadGeneratedTitle(title) {
  return /^(프리미엄\s*교재\s*생성|sample preview|pre-test|the old way|logic bankruptcy|untitled)$/i.test(
    String(title ?? "").trim(),
  );
}

function normalizeQuestionType(type, fallback) {
  const raw = String(type ?? "").toLowerCase();
  if (raw === "multiple-choice" || raw === "mcq" || raw.includes("객관")) return "multiple-choice";
  if (raw === "short-answer" || raw.includes("주관") || raw.includes("단답")) return "short-answer";
  if (raw === "blank" || raw.includes("빈칸")) return "blank";
  if (raw === "essay" || raw.includes("서술")) return "essay";
  if (raw === "matching" || raw.includes("매칭")) return "matching";
  if (raw === "ordering" || raw.includes("순서")) return "ordering";
  return fallback || "short-answer";
}

function normalizeQuestionText(text) {
  return sanitizeText(text, 1200).replace(/\s+/g, " ");
}

function questionKey(question) {
  return normalizeQuestionText(question?.question)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function containsInvalidPhrase(value) {
  const text = String(value ?? "");
  return invalidQuestionPatterns.some((pattern) => pattern.test(text));
}

function validatePremiumQuestion(question) {
  if (!question || typeof question !== "object") return false;
  const questionText = normalizeQuestionText(question.question);
  const answer = sanitizeText(question.answer, 800);
  const explanation = sanitizeText(question.explanation, 1200);
  if (!questionText || !answer || !explanation) return false;
  if (containsInvalidPhrase(questionText) || containsInvalidPhrase(answer) || containsInvalidPhrase(explanation)) return false;
  if (/^다음\s*설명으로\s*알맞은\s*것은\??$/i.test(questionText)) return false;
  if (question.type === "multiple-choice") {
    if (!Array.isArray(question.choices)) return false;
    const choices = question.choices.map((choice) => sanitizeText(choice, 240)).filter(Boolean);
    if (choices.length < 4) return false;
    if (new Set(choices.map((choice) => choice.toLowerCase())).size < 4) return false;
  }
  return true;
}

function normalizePremiumQuestion(raw, fallbackType) {
  const type = normalizeQuestionType(raw?.type, fallbackType);
  return {
    type,
    question: normalizeQuestionText(raw?.question),
    choices:
      type === "multiple-choice"
        ? Array.isArray(raw?.choices)
          ? raw.choices.map((choice) => sanitizeText(choice, 240)).filter(Boolean).slice(0, 6)
          : []
        : undefined,
    answer: sanitizeText(raw?.answer, 800),
    explanation: sanitizeText(raw?.explanation, 1200),
    difficulty: ["easy", "medium", "hard"].includes(raw?.difficulty) ? raw.difficulty : "medium",
  };
}

function dedupeQuestions(questions) {
  const seen = new Set();
  const out = [];
  for (const question of questions) {
    if (!validatePremiumQuestion(question)) continue;
    const key = questionKey(question);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(question);
  }
  return out;
}

function extractJsonObject(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  }
}

function sourceSummaryForPrompt({ sourceText, uploadedFiles }) {
  const fileLines =
    uploadedFiles.length > 0
      ? uploadedFiles.map((file) => `- ${file.name} (${file.type || "unknown"}, ${file.size} bytes)`).join("\n")
      : "- 업로드 파일 없음";

  return `업로드 자료 메타데이터:
${fileLines}

붙여넣은 원문:
---
${sourceText || "(붙여넣은 원문 없음. 업로드 파일 메타데이터와 사용자 주문을 중심으로 작성.)"}
---`;
}

function buildSkeletonPrompt({ templateId, template, userInstruction, pastedText, uploadedFiles, plan, sourceTitle }) {
  return `사용자가 제공한 자료를 바탕으로 독자적인 XUniverse 프리미엄 학습 교재의 표지, 단원, 개념 설명을 만들어라.
특정 출판사/EBS의 고유 디자인, 로고, 문구, 고유 레이아웃을 모방하지 말고, XUniverse의 고급 교육 교재 스타일로 구성하라.
문항은 별도 batch에서 생성하므로 questions는 반드시 []로 둔다.

선택 템플릿:
- templateId: ${templateId}
- templateName: ${template.name}
- sections: ${template.sections.join(" / ")}
- templateInstruction: ${template.promptInstruction}

생성 계획:
- 교재 주제/제목 기준어: ${sourceTitle}
- 개념 설명 페이지 수: 정확히 ${plan.conceptPages}개 conceptPages 생성
${plan.targetPages ? `- 사용자가 기대한 총 페이지 수: 약 ${plan.targetPages}페이지` : ""}

사용자 주문:
${userInstruction}

${sourceSummaryForPrompt({ sourceText: pastedText, uploadedFiles })}

반드시 지킬 것:
- title, unitTitle, conceptPages.heading은 원문과 사용자 주문의 주제에 맞는 단어만 사용.
- 교재 내용과 무관한 극적인 제목, 임의의 영어 제목, Pre-Test, The Old Way 같은 제목을 만들지 말 것.
- conceptPages 각 페이지는 bodyParagraphs 3~5개로 충분히 길게 작성.
- questions는 []로 둔다.

JSON 구조:
{
  "title": string,
  "subtitle": string,
  "brandLabel": "Xtudy-Universe · AI Learning Platform",
  "templateId": "${templateId}",
  "targetLearner": string,
  "overview": string,
  "units": [
    {
      "unitTitle": string,
      "unitSubtitle": string,
      "learningGoals": string[],
      "conceptSummary": string,
      "conceptPages": [
        {
          "heading": string,
          "bodyParagraphs": string[],
          "keyTakeaway": string,
          "example": string
        }
      ],
      "keyVocabulary": [{ "term": string, "meaning": string, "example": string }],
      "grammarPoints": string[],
      "examples": string[],
      "questions": []
    }
  ]
}`;
}

function questionTypeInstruction(questionType) {
  if (!questionType) return "문항 유형은 사용자 주문과 자료 성격에 맞게 객관식, 빈칸, 주관식, 서술형 등을 자연스럽게 섞어라.";
  const labels = {
    "multiple-choice": "객관식 multiple-choice",
    "short-answer": "주관식/단답형 short-answer",
    blank: "빈칸 blank",
    essay: "서술형 essay",
    matching: "매칭 matching",
    ordering: "순서 배열 ordering",
  };
  return `문항 유형은 반드시 ${labels[questionType] || questionType} 중심으로 작성하라. type 필드는 "${questionType}"로 반환하라.`;
}

function buildQuestionBatchPrompt({ count, questionType, templateId, userInstruction, sourceText, uploadedFiles, existingQuestions }) {
  const existing = existingQuestions
    .slice(-30)
    .map((question, index) => `${index + 1}. ${sanitizeText(question.question, 180)}`)
    .join("\n");

  return `You are generating premium textbook questions for XUniverse.
You must generate exactly ${count} questions.
Do not generate fewer than ${count} questions.
Do not include placeholder questions.
Do not create filler questions.
Do not repeat previous questions.
Each question must be based on the provided source material and the user's instruction.
Each question must include an answer and explanation.
Return only valid JSON.

반드시 정확히 ${count}개의 문항을 생성하라.
${count}개보다 적게 생성하지 마라.
임시 문항이나 보정 문항을 만들지 마라.
분량을 채우기 위한 filler 문항을 만들지 마라.
기존 문항과 중복되는 문항을 만들지 마라.
각 문항은 반드시 사용자가 제공한 자료와 주문에 근거해야 한다.
각 문항에는 정답과 해설을 포함해야 한다.

템플릿: ${templateId}
문항 유형 지시: ${questionTypeInstruction(questionType)}

사용자 주문:
${userInstruction}

${sourceSummaryForPrompt({ sourceText, uploadedFiles })}

Already generated questions:
${existing || "(none)"}

JSON 구조:
{
  "questions": [
    {
      "type": "multiple-choice" | "short-answer" | "blank" | "essay" | "matching" | "ordering",
      "question": string,
      "choices": string[],
      "answer": string,
      "explanation": string,
      "difficulty": "easy" | "medium" | "hard"
    }
  ]
}`;
}

async function requestOpenAiJson({ apiKey, model, messages, maxTokens = 7000 }) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[generate-premium-textbook] OpenAI request failed", response.status, detail.slice(0, 600));
    throw new Error("openai-request-failed");
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = extractJsonObject(content);
  if (!parsed) throw new Error("openai-json-parse-failed");
  return parsed;
}

async function generateSkeleton({ apiKey, model, templateId, template, userInstruction, pastedText, uploadedFiles, plan, sourceTitle }) {
  if (!apiKey) {
    return mockSkeleton({ templateId, template, userInstruction, pastedText, uploadedFiles, plan, sourceTitle });
  }

  return requestOpenAiJson({
    apiKey,
    model,
    maxTokens: 6500,
    messages: [
      {
        role: "system",
        content:
          "You are an expert educational textbook editor for Xtudy-Universe. Return only valid JSON. Never copy EBS or any publisher's logo, proprietary layout, or exact branding.",
      },
      { role: "user", content: buildSkeletonPrompt({ templateId, template, userInstruction, pastedText, uploadedFiles, plan, sourceTitle }) },
    ],
  });
}

function mockSkeleton({ templateId, template, pastedText, uploadedFiles, plan, sourceTitle }) {
  return {
    title: sourceTitle,
    subtitle: `${template.name} preview`,
    brandLabel: "Xtudy-Universe · AI Learning Platform",
    templateId,
    targetLearner: "학생 및 수업 참여자",
    overview:
      "제공된 원문과 업로드 자료 메타데이터를 바탕으로 표지, 개념 설명, 문제, 정답 및 해설이 포함된 XUniverse 프리미엄 교재 미리보기입니다.",
    units: [
      {
        unitTitle: `${sourceTitle} 핵심 개념`,
        unitSubtitle: "개념 설명과 실전 문제",
        learningGoals: [`${sourceTitle}의 핵심 개념을 설명할 수 있다.`, "문항 풀이 후 정답 근거를 제시할 수 있다."],
        conceptSummary:
          pastedText.slice(0, 260) ||
          `업로드된 자료 ${uploadedFiles.map((file) => file.name).join(", ") || "없음"}를 바탕으로 교재 본문을 구성합니다.`,
        conceptPages: Array.from({ length: plan.conceptPages }, (_, index) => ({
          heading: `${sourceTitle} 핵심 개념 ${index + 1}`,
          bodyParagraphs: [
            `${sourceTitle}의 핵심 개념을 원문 내용과 연결해 정리합니다. 이 페이지는 사용자가 요청한 개념 설명 분량에 맞춰 구성된 개념 페이지입니다.`,
            "학습자는 정의, 대조, 원인과 결과, 예시, 적용 과정을 구분해 읽어야 합니다.",
            "문항 풀이에서는 이 개념을 선택지 판단과 주관식 서술의 근거로 사용합니다.",
          ],
          keyTakeaway: `${sourceTitle}의 중심 원리를 문항 판단 기준으로 바꾸는 것이 중요합니다.`,
          example: `예: '${sourceTitle}' 관련 문장을 읽고 핵심어와 근거 표현을 분리해 설명한다.`,
        })),
        keyVocabulary: [],
        grammarPoints: template.sections.slice(0, 3).map((section) => `${section} 중심으로 학습 흐름을 정리합니다.`),
        examples: ["원문에서 핵심 문장을 찾아 요약하기", "개념을 변형 문제에 적용하기"],
        questions: [],
      },
    ],
  };
}

function mockQuestions({ count, questionType, sourceText, existingQuestions }) {
  const baseTitle =
    sourceText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 36) || "제공 자료";
  const start = existingQuestions.length + 1;
  return Array.from({ length: count }, (_, index) => {
    const n = start + index;
    const type = questionType || (index % 3 === 0 ? "multiple-choice" : index % 3 === 1 ? "blank" : "short-answer");
    const question = {
      type,
      question:
        type === "blank"
          ? `${baseTitle}에서 핵심 개념 ${n}을 설명하는 문장의 빈칸에 들어갈 말을 쓰시오.`
          : type === "multiple-choice"
            ? `${baseTitle}의 핵심 개념 ${n}에 대한 설명으로 가장 적절한 것은?`
            : `${baseTitle}의 핵심 개념 ${n}을 원문 근거와 함께 설명하시오.`,
      choices:
        type === "multiple-choice"
          ? [
              `${baseTitle}의 중심 개념을 원문 근거와 연결한다.`,
              "원문과 무관한 배경지식만 사용한다.",
              "정답 번호만 암기하고 해설을 생략한다.",
              "문항 유형과 원문 구조를 분리하지 않는다.",
            ]
          : undefined,
      answer: type === "multiple-choice" ? `${baseTitle}의 중심 개념을 원문 근거와 연결한다.` : `${baseTitle}의 핵심 개념과 근거를 설명한다.`,
      explanation: `${baseTitle}의 원문 구조와 핵심 표현을 근거로 판단해야 합니다.`,
      difficulty: n % 5 === 0 ? "hard" : n % 2 === 0 ? "medium" : "easy",
    };
    return question;
  });
}

async function generateQuestionBatch({ apiKey, model, count, questionType, templateId, userInstruction, sourceText, uploadedFiles, existingQuestions }) {
  if (!apiKey) {
    return mockQuestions({ count, questionType, sourceText, existingQuestions });
  }

  const parsed = await requestOpenAiJson({
    apiKey,
    model,
    maxTokens: 6000,
    messages: [
      {
        role: "system",
        content:
          "You are an expert exam-item writer. Return only valid JSON. Create source-grounded, non-duplicative questions with answers and explanations.",
      },
      {
        role: "user",
        content: buildQuestionBatchPrompt({
          count,
          questionType,
          templateId,
          userInstruction,
          sourceText,
          uploadedFiles,
          existingQuestions,
        }),
      },
    ],
  });

  return Array.isArray(parsed.questions) ? parsed.questions : [];
}

function normalizeBatchQuestions(rawQuestions, fallbackType) {
  return dedupeQuestions(rawQuestions.map((question) => normalizePremiumQuestion(question, fallbackType)));
}

function countMatchingType(questions, type) {
  return questions.filter((question) => question.type === type).length;
}

function missingBatchesForPlan(plan, questions) {
  const batches = [];
  const pushChunks = (missing, questionType) => {
    let remaining = missing;
    while (remaining > 0) {
      const count = Math.min(DEFAULT_QUESTION_BATCH_SIZE, remaining);
      batches.push({ count, questionType });
      remaining -= count;
    }
  };

  if (plan.typeCounts) {
    for (const type of QUESTION_TYPES) {
      const target = plan.typeCounts[type] ?? 0;
      const current = countMatchingType(questions, type);
      if (target > current) pushChunks(target - current, type);
    }
  } else if (questions.length < plan.totalCount) {
    pushChunks(plan.totalCount - questions.length);
  }

  return batches;
}

function trimQuestionsToPlan(questions, plan) {
  if (!plan.typeCounts) return questions.slice(0, plan.totalCount);
  const out = [];
  for (const type of QUESTION_TYPES) {
    const target = plan.typeCounts[type] ?? 0;
    if (target > 0) out.push(...questions.filter((question) => question.type === type).slice(0, target));
  }
  return out;
}

async function ensureQuestionCount({ apiKey, model, plan, templateId, userInstruction, sourceText, uploadedFiles }) {
  let questions = [];
  let retries = 0;

  for (const batch of plan.batches) {
    try {
      const raw = await generateQuestionBatch({
        apiKey,
        model,
        count: batch.count,
        questionType: batch.questionType,
        templateId,
        userInstruction,
        sourceText,
        uploadedFiles,
        existingQuestions: questions,
      });
      questions = dedupeQuestions([...questions, ...normalizeBatchQuestions(raw, batch.questionType)]);
    } catch (error) {
      console.error("[generate-premium-textbook] question batch failed", {
        message: error instanceof Error ? error.message : "unknown",
        questionType: batch.questionType || "mixed",
        count: batch.count,
      });
    }
  }

  while (missingBatchesForPlan(plan, questions).length > 0 && retries < MAX_RETRY_FOR_MISSING_QUESTIONS) {
    retries += 1;
    const missingBatches = missingBatchesForPlan(plan, questions);
    for (const batch of missingBatches) {
      try {
        const raw = await generateQuestionBatch({
          apiKey,
          model,
          count: batch.count,
          questionType: batch.questionType,
          templateId,
          userInstruction,
          sourceText,
          uploadedFiles,
          existingQuestions: questions,
        });
        questions = dedupeQuestions([...questions, ...normalizeBatchQuestions(raw, batch.questionType)]);
      } catch (error) {
        console.error("[generate-premium-textbook] question retry failed", {
          message: error instanceof Error ? error.message : "unknown",
          questionType: batch.questionType || "mixed",
          count: batch.count,
          retry: retries,
        });
      }
    }
  }

  const finalQuestions = trimQuestionsToPlan(dedupeQuestions(questions), plan);
  const missingCount = Math.max(0, plan.totalCount - finalQuestions.length);
  return {
    questions: finalQuestions,
    completed: missingCount === 0,
    missingCount,
  };
}

function ensureConceptPages(unit, plan, sourceTitle) {
  const existing = Array.isArray(unit?.conceptPages)
    ? unit.conceptPages
        .map((page, index) => ({
          heading: sanitizeText(page?.heading, 120) || `${sourceTitle} 개념 ${index + 1}`,
          bodyParagraphs: Array.isArray(page?.bodyParagraphs)
            ? page.bodyParagraphs.map((paragraph) => sanitizeText(paragraph, 1000)).filter(Boolean).slice(0, 6)
            : [],
          keyTakeaway: sanitizeText(page?.keyTakeaway, 500),
          example: sanitizeText(page?.example, 700),
        }))
        .filter((page) => page.bodyParagraphs.length > 0 || page.keyTakeaway || page.example)
    : [];

  const summary = sanitizeText(unit?.conceptSummary, 3000);
  while (existing.length < plan.conceptPages) {
    const index = existing.length + 1;
    existing.push({
      heading: `${sourceTitle} 핵심 개념 ${index}`,
      bodyParagraphs: [
        summary || `${sourceTitle}의 핵심 개념을 원문 내용과 연결해 정리합니다.`,
        "학습자는 이 개념을 단순 암기가 아니라 문제 풀이의 판단 기준으로 사용해야 합니다.",
        "다음 문제 풀이에서는 이 개념이 선택지 판단, 주관식 서술, 정답 근거 제시로 연결됩니다.",
      ],
      keyTakeaway: `${sourceTitle}의 핵심어를 문제 판단 기준으로 바꾸는 것이 중요합니다.`,
      example: `예: '${sourceTitle}' 관련 문장을 읽고, 중심 개념과 근거 표현을 분리해 설명한다.`,
    });
  }

  return existing.slice(0, plan.conceptPages);
}

function normalizePremiumTextbook(textbook, { templateId, plan, sourceTitle, questionResult }) {
  const units = Array.isArray(textbook.units) && textbook.units.length > 0 ? textbook.units : [{}];
  const firstUnit = units[0] ?? {};
  const questions = questionResult.questions;
  const normalizedTitle = isBadGeneratedTitle(textbook.title) ? sourceTitle : sanitizeText(textbook.title, 120) || sourceTitle;
  const unitTitle = isBadGeneratedTitle(firstUnit.unitTitle) ? `${normalizedTitle} 핵심 개념` : sanitizeText(firstUnit.unitTitle, 120) || `${normalizedTitle} 핵심 개념`;
  const normalizedUnit = {
    unitTitle,
    unitSubtitle: sanitizeText(firstUnit.unitSubtitle, 160) || "개념 설명과 실전 문제",
    learningGoals:
      Array.isArray(firstUnit.learningGoals) && firstUnit.learningGoals.length > 0
        ? firstUnit.learningGoals.map((goal) => sanitizeText(goal, 240)).filter(Boolean).slice(0, 8)
        : [`${normalizedTitle}의 핵심 개념을 설명할 수 있다.`, "문항에서 정답 근거를 제시할 수 있다."],
    conceptSummary:
      sanitizeText(firstUnit.conceptSummary, 3000) ||
      `${normalizedTitle}의 핵심 개념을 사용자의 주문에 맞춰 긴 설명형 교재 구조로 정리합니다.`,
    conceptPages: Array.isArray(firstUnit.conceptPages) ? firstUnit.conceptPages : [],
    keyVocabulary: Array.isArray(firstUnit.keyVocabulary) ? firstUnit.keyVocabulary.slice(0, 20) : [],
    grammarPoints: Array.isArray(firstUnit.grammarPoints) ? firstUnit.grammarPoints.slice(0, 20) : [],
    examples: Array.isArray(firstUnit.examples) ? firstUnit.examples.slice(0, 20) : [],
    questions,
  };
  normalizedUnit.conceptPages = ensureConceptPages(normalizedUnit, plan, normalizedTitle);

  const answerKey = questions.map((question, index) => ({
    questionNumber: index + 1,
    answer: question.answer,
    explanation: question.explanation,
  }));

  return {
    ...textbook,
    title: normalizedTitle,
    subtitle: sanitizeText(textbook.subtitle, 180) || "개념 설명 · 실전 문제 · 정답 및 해설",
    brandLabel: textbook.brandLabel || "Xtudy-Universe · AI Learning Platform",
    templateId,
    overview:
      sanitizeText(textbook.overview, 1200) ||
      `${normalizedTitle}를 바탕으로 개념 설명 ${plan.conceptPages}페이지와 ${questions.length}개 문항 및 답안지를 구성했습니다.`,
    units: [normalizedUnit],
    answerKey,
    generationPlan: {
      conceptPages: plan.conceptPages,
      targetPages: plan.targetPages,
      questionPlan: plan.questionPlan,
      completed: questionResult.completed,
      missingCount: questionResult.missingCount,
    },
    generationWarning: questionResult.completed
      ? undefined
      : "요청한 문항 수보다 적은 문항이 생성되었습니다. 자료를 더 추가하거나 요청 문항 수를 줄이면 더 안정적으로 생성됩니다.",
  };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const generationType = body.generationType;
    const templateId = sanitizeText(body.templateId, 80);
    const template = templates[templateId];
    const userInstruction = sanitizeText(body.userInstruction, 6000);
    const pastedText = sanitizeText(body.pastedText, TEXT_SLICE_LIMIT);
    const uploadedFiles = normalizeFiles(body.uploadedFiles);
    const plan = buildGenerationPlan(userInstruction);
    const sourceTitle = deriveSourceTitle({ userInstruction, pastedText, uploadedFiles });

    if (generationType !== "premium") {
      res.status(400).json({ error: "Invalid generation type" });
      return;
    }

    if (!template) {
      res.status(400).json({ error: "프리미엄 교재 템플릿을 선택해주세요." });
      return;
    }

    if (!userInstruction) {
      res.status(400).json({ error: "어떤 교재를 만들지 주문을 입력해주세요." });
      return;
    }

    if (!pastedText && uploadedFiles.length === 0) {
      res.status(400).json({ error: "교재 제작에 사용할 원문을 붙여넣거나 파일을 업로드해주세요." });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const skeleton = await generateSkeleton({ apiKey, model, templateId, template, userInstruction, pastedText, uploadedFiles, plan, sourceTitle });
    const questionResult = await ensureQuestionCount({
      apiKey,
      model,
      plan: plan.questionPlan,
      templateId,
      userInstruction,
      sourceText: pastedText,
      uploadedFiles,
    });

    res.status(200).json({
      textbook: normalizePremiumTextbook(skeleton, { templateId, plan, sourceTitle, questionResult }),
      meta: { model: apiKey ? model : "mock", source: apiKey ? "openai" : "mock" },
    });
  } catch (error) {
    console.error("[generate-premium-textbook]", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "문항 생성 중 문제가 발생했습니다. 다시 시도해주세요." });
  }
}
