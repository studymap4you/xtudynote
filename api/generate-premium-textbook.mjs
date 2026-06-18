const TEXT_SLICE_LIMIT = 28000;

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

function buildGenerationPlan(userInstruction) {
  const normalized = userInstruction.replace(/\s+/g, " ");
  const conceptPages =
    firstNumberNear(normalized, [
      /개념\s*설명\D{0,12}(\d+)\s*페이지/i,
      /개념\D{0,12}(\d+)\s*페이지/i,
      /(\d+)\s*페이지\D{0,12}개념/i,
    ]) ?? 4;
  const multipleChoiceCount =
    firstNumberNear(normalized, [
      /객관식\D{0,12}(\d+)\s*(?:개|문제|문항)/i,
      /(\d+)\s*(?:개|문제|문항)\D{0,12}객관식/i,
    ]) ?? 12;
  const shortAnswerCount =
    firstNumberNear(normalized, [
      /주관식\D{0,12}(\d+)\s*(?:개|문제|문항)/i,
      /서술형\D{0,12}(\d+)\s*(?:개|문제|문항)/i,
      /단답형\D{0,12}(\d+)\s*(?:개|문제|문항)/i,
      /(\d+)\s*(?:개|문제|문항)\D{0,12}(?:주관식|서술형|단답형)/i,
    ]) ?? 4;
  const targetPages =
    firstNumberNear(normalized, [
      /총\s*페이지\D{0,12}(\d+)\s*페이지/i,
      /전체\D{0,12}(\d+)\s*페이지/i,
      /(\d+)\s*페이지\D{0,12}정도/i,
    ]) ?? undefined;

  return {
    conceptPages: Math.min(Math.max(conceptPages, 1), 20),
    multipleChoiceCount: Math.min(Math.max(multipleChoiceCount, 0), 80),
    shortAnswerCount: Math.min(Math.max(shortAnswerCount, 0), 40),
    targetPages: targetPages ? Math.min(Math.max(targetPages, 4), 120) : undefined,
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
  if (raw === "short-answer" || raw.includes("주관") || raw.includes("서술") || raw.includes("단답")) return "short-answer";
  if (raw === "blank" || raw.includes("빈칸")) return "blank";
  if (raw === "essay") return "essay";
  return fallback;
}

function buildFallbackQuestion({ index, type, sourceTitle }) {
  const isMcq = type === "multiple-choice";
  return {
    type,
    question: isMcq
      ? `${sourceTitle}의 핵심 개념을 가장 알맞게 설명한 것은?`
      : `${sourceTitle}의 핵심 개념을 한 문장으로 설명하시오.`,
    choices: isMcq
      ? [
          `${sourceTitle}의 중심 원리를 파악하고 적용한다.`,
          "본문의 모든 표현을 순서 없이 암기한다.",
          "문제 선택지만 보고 답을 정한다.",
          "해설 없이 정답 번호만 확인한다.",
        ]
      : undefined,
    answer: isMcq ? `${sourceTitle}의 중심 원리를 파악하고 적용한다.` : `${sourceTitle}의 핵심 원리와 적용 방식을 설명한다.`,
    explanation: `생성 문항 수가 주문보다 부족해 보강된 문항입니다. ${sourceTitle}의 중심 개념과 적용 과정을 확인하도록 구성했습니다.`,
    difficulty: index % 5 === 0 ? "hard" : index % 2 === 0 ? "medium" : "easy",
  };
}

function ensureQuestionCounts(questions, plan, sourceTitle) {
  const normalized = Array.isArray(questions)
    ? questions.map((question, index) => ({
        type: normalizeQuestionType(question?.type, index % 2 === 0 ? "multiple-choice" : "short-answer"),
        question: sanitizeText(question?.question, 1200) || buildFallbackQuestion({ index, type: "short-answer", sourceTitle }).question,
        choices: Array.isArray(question?.choices) ? question.choices.map((choice) => sanitizeText(choice, 240)).filter(Boolean).slice(0, 5) : undefined,
        answer: sanitizeText(question?.answer, 800) || "정답은 해설을 참고하세요.",
        explanation: sanitizeText(question?.explanation, 1200) || "핵심 개념을 근거로 정답을 판단합니다.",
        difficulty: ["easy", "medium", "hard"].includes(question?.difficulty) ? question.difficulty : "medium",
      }))
    : [];

  const mcq = normalized.filter((question) => question.type === "multiple-choice").slice(0, plan.multipleChoiceCount);
  const short = normalized
    .filter((question) => question.type !== "multiple-choice")
    .map((question) => ({ ...question, type: "short-answer", choices: undefined }))
    .slice(0, plan.shortAnswerCount);

  while (mcq.length < plan.multipleChoiceCount) {
    mcq.push(buildFallbackQuestion({ index: mcq.length + 1, type: "multiple-choice", sourceTitle }));
  }
  while (short.length < plan.shortAnswerCount) {
    short.push(buildFallbackQuestion({ index: short.length + 1, type: "short-answer", sourceTitle }));
  }

  return [...mcq, ...short];
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
        summary ||
          `${sourceTitle}의 핵심 개념을 원문 내용과 연결해 정리합니다. 이 페이지는 개념 설명 분량을 사용자의 주문에 맞추기 위해 보강되었습니다.`,
        `학습자는 이 개념을 단순 암기가 아니라 문제 풀이의 판단 기준으로 사용해야 합니다. 원문에서 반복되는 표현, 정의, 대조, 원인과 결과를 확인하며 적용합니다.`,
        `다음 문제 풀이에서는 이 개념이 선택지 판단, 주관식 서술, 정답 근거 제시로 연결됩니다.`,
      ],
      keyTakeaway: `${sourceTitle}의 핵심어를 문제 판단 기준으로 바꾸는 것이 중요합니다.`,
      example: `예: '${sourceTitle}' 관련 문장을 읽고, 중심 개념과 근거 표현을 분리해 설명한다.`,
    });
  }

  return existing.slice(0, plan.conceptPages);
}

function normalizePremiumTextbook(textbook, { templateId, plan, sourceTitle }) {
  const units = Array.isArray(textbook.units) && textbook.units.length > 0 ? textbook.units : [{}];
  const firstUnit = units[0] ?? {};
  const questions = ensureQuestionCounts(
    units.flatMap((unit) => (Array.isArray(unit?.questions) ? unit.questions : [])),
    plan,
    sourceTitle,
  );
  const normalizedUnit = {
    unitTitle: isBadGeneratedTitle(firstUnit.unitTitle) ? `${sourceTitle} 핵심 개념` : sanitizeText(firstUnit.unitTitle, 120) || `${sourceTitle} 핵심 개념`,
    unitSubtitle: sanitizeText(firstUnit.unitSubtitle, 160) || "개념 설명과 실전 문제",
    learningGoals:
      Array.isArray(firstUnit.learningGoals) && firstUnit.learningGoals.length > 0
        ? firstUnit.learningGoals.map((goal) => sanitizeText(goal, 240)).filter(Boolean).slice(0, 8)
        : [`${sourceTitle}의 핵심 개념을 설명할 수 있다.`, "객관식과 주관식 문항에서 정답 근거를 제시할 수 있다."],
    conceptSummary:
      sanitizeText(firstUnit.conceptSummary, 3000) ||
      `${sourceTitle}의 핵심 개념을 사용자의 주문에 맞춰 긴 설명형 교재 구조로 정리합니다.`,
    conceptPages: [],
    keyVocabulary: Array.isArray(firstUnit.keyVocabulary) ? firstUnit.keyVocabulary.slice(0, 20) : [],
    grammarPoints: Array.isArray(firstUnit.grammarPoints) ? firstUnit.grammarPoints.slice(0, 20) : [],
    examples: Array.isArray(firstUnit.examples) ? firstUnit.examples.slice(0, 20) : [],
    questions,
  };
  normalizedUnit.conceptPages = ensureConceptPages(normalizedUnit, plan, sourceTitle);

  const answerKey = questions.map((question, index) => ({
    questionNumber: index + 1,
    answer: question.answer,
    explanation: question.explanation,
  }));

  return {
    ...textbook,
    title: isBadGeneratedTitle(textbook.title) ? sourceTitle : sanitizeText(textbook.title, 120) || sourceTitle,
    subtitle: sanitizeText(textbook.subtitle, 180) || "개념 설명 · 실전 문제 · 정답 및 해설",
    brandLabel: textbook.brandLabel || "Xtudy-Universe · AI Learning Platform",
    templateId,
    overview:
      sanitizeText(textbook.overview, 1200) ||
      `${sourceTitle}를 바탕으로 개념 설명 ${plan.conceptPages}페이지, 객관식 ${plan.multipleChoiceCount}문항, 주관식 ${plan.shortAnswerCount}문항, 답안지를 포함해 구성했습니다.`,
    units: [normalizedUnit],
    answerKey,
    generationPlan: plan,
  };
}

function mockTextbook({ templateId, template, userInstruction, pastedText, uploadedFiles, plan, sourceTitle }) {
  const seedTitle = userInstruction.split(/[.!?\n]/).map((line) => line.trim()).find(Boolean);
  const sourceLine = pastedText.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  const title = sourceTitle || sourceLine?.slice(0, 54) || seedTitle?.slice(0, 54) || "XUniverse Premium Textbook";

  return normalizePremiumTextbook({
    title,
    subtitle: `${template.name} sample preview`,
    brandLabel: "Xtudy-Universe · AI Learning Platform",
    templateId,
    targetLearner: "학생 및 수업 참여자",
    overview:
      "제공된 원문과 업로드 자료 메타데이터를 바탕으로 표지, 개념 설명, 문제, 정답 및 해설이 포함된 XUniverse 프리미엄 교재 미리보기입니다.",
    units: [
      {
        unitTitle: "Unit 1. 핵심 개념 정리",
        unitSubtitle: "Source-based premium lesson",
        learningGoals: ["자료의 핵심 개념을 설명할 수 있다.", "핵심 어휘와 예문을 활용할 수 있다.", "문항 풀이 후 정답 근거를 설명할 수 있다."],
        conceptSummary:
          pastedText.slice(0, 260) ||
          `업로드된 자료 ${uploadedFiles.map((file) => file.name).join(", ") || "없음"}를 바탕으로 교재 본문을 구성합니다.`,
        keyVocabulary: [
          { term: "Core concept", meaning: "단원의 중심 개념", example: "Students identify the core concept first." },
          { term: "Application", meaning: "개념을 문제 풀이에 적용하는 과정", example: "Apply the rule to a new sentence." },
        ],
        grammarPoints: template.sections.slice(0, 3).map((section) => `${section} 중심으로 학습 흐름을 정리합니다.`),
        examples: ["예제 1: 원문에서 핵심 문장을 찾아 요약하기", "예제 2: 개념을 변형 문제에 적용하기"],
        questions: [
          {
            type: "multiple-choice",
            question: "다음 중 이 단원의 핵심 학습 목표로 가장 적절한 것은?",
            choices: ["자료 암기만 하기", "핵심 개념을 이해하고 적용하기", "정답만 외우기", "문제 유형을 무시하기"],
            answer: "핵심 개념을 이해하고 적용하기",
            explanation: "프리미엄 교재는 개념 이해, 적용, 해설까지 이어지는 구조를 목표로 합니다.",
            difficulty: "easy",
          },
          {
            type: "blank",
            question: "XUniverse 프리미엄 교재는 표지, 개념, 문제, 정답 및 ______을 포함한다.",
            answer: "해설",
            explanation: "주문서 요구사항에 따라 정답뿐 아니라 해설까지 포함합니다.",
            difficulty: "medium",
          },
        ],
      },
    ],
  }, { templateId, plan, sourceTitle });
}

function buildPrompt({ templateId, template, userInstruction, pastedText, uploadedFiles, plan, sourceTitle }) {
  const fileLines =
    uploadedFiles.length > 0
      ? uploadedFiles.map((file) => `- ${file.name} (${file.type || "unknown"}, ${file.size} bytes)`).join("\n")
      : "- 업로드 파일 없음";

  return `사용자가 제공한 자료를 바탕으로 독자적인 XUniverse 프리미엄 학습 교재를 만들어라.
특정 출판사/EBS의 고유 디자인, 로고, 문구, 고유 레이아웃을 모방하지 말고, XUniverse의 고급 교육 교재 스타일로 구성하라.
결과는 교재 내지 미리보기에 바로 배치하기 쉬운 JSON 객체 하나로만 출력하라.

선택 템플릿:
- templateId: ${templateId}
- templateName: ${template.name}
- sections: ${template.sections.join(" / ")}
- templateInstruction: ${template.promptInstruction}

생성 계획(반드시 준수):
- 교재 주제/제목 기준어: ${sourceTitle}
- 개념 설명 페이지 수: 정확히 ${plan.conceptPages}개 conceptPages 생성
- 객관식 문제 수: 정확히 ${plan.multipleChoiceCount}개
- 주관식/서술형 문제 수: 정확히 ${plan.shortAnswerCount}개
${plan.targetPages ? `- 사용자가 기대한 총 페이지 수: 약 ${plan.targetPages}페이지. 렌더링 단계에서 페이지가 나뉘도록 conceptPages와 questions를 충분히 자세히 작성.` : ""}

사용자 주문:
${userInstruction}

업로드 자료 메타데이터:
${fileLines}

붙여넣은 원문:
---
${pastedText || "(붙여넣은 원문 없음. 업로드 파일 메타데이터와 사용자 주문을 중심으로 초안을 구성하라.)"}
---

반드시 포함할 내용:
1. 표지 느낌의 title, subtitle, overview
2. 단원별 learningGoals, conceptSummary, conceptPages
3. 필요 시 keyVocabulary, grammarPoints, examples
4. questions에는 multiple-choice를 정확히 ${plan.multipleChoiceCount}개, short-answer 또는 essay를 정확히 ${plan.shortAnswerCount}개 포함
5. 모든 questions에는 answer와 explanation 포함
6. answerKey 포함
7. templateId는 "${templateId}" 그대로 사용
8. title, unitTitle, conceptPages.heading은 원문과 사용자 주문의 주제에 맞는 단어만 사용. 교재 내용과 무관한 극적인 제목, 임의의 영어 제목, Pre-Test, The Old Way 같은 제목을 만들지 말 것.
9. conceptPages 각 페이지는 bodyParagraphs 3~5개로 충분히 길게 작성. 짧은 요약 한 문장으로 끝내지 말 것.

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
    }
  ],
  "answerKey": [{ "questionNumber": number, "answer": string, "explanation": string }]
}`;
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
    if (!apiKey) {
      res.status(200).json({
        textbook: mockTextbook({ templateId, template, userInstruction, pastedText, uploadedFiles, plan, sourceTitle }),
        meta: { model: "mock", source: "mock" },
      });
      return;
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 16000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are an expert educational textbook editor for Xtudy-Universe. Return only valid JSON. Never copy EBS or any publisher's logo, proprietary layout, or exact branding.",
          },
          { role: "user", content: buildPrompt({ templateId, template, userInstruction, pastedText, uploadedFiles, plan, sourceTitle }) },
        ],
      }),
    });

    if (!openAiResponse.ok) {
      const detail = await openAiResponse.text().catch(() => "");
      console.error("[generate-premium-textbook] OpenAI request failed", openAiResponse.status, detail.slice(0, 600));
      res.status(502).json({ error: "프리미엄 교재 생성에 실패했습니다. 잠시 후 다시 시도해주세요." });
      return;
    }

    const data = await openAiResponse.json();
    const content = data?.choices?.[0]?.message?.content;
    const textbook = extractJsonObject(content);

    if (!textbook || !Array.isArray(textbook.units)) {
      res.status(502).json({ error: "AI 응답을 교재 구조로 변환하지 못했습니다." });
      return;
    }

    res.status(200).json({
      textbook: normalizePremiumTextbook(textbook, { templateId, plan, sourceTitle }),
      meta: { model, source: "openai" },
    });
  } catch (error) {
    console.error("[generate-premium-textbook]", error);
    res.status(500).json({ error: "프리미엄 교재 생성 중 오류가 발생했습니다." });
  }
}
