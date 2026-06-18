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

function mockTextbook({ templateId, template, userInstruction, pastedText, uploadedFiles }) {
  const seedTitle = userInstruction.split(/[.!?\n]/).map((line) => line.trim()).find(Boolean);
  const sourceLine = pastedText.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  const title = seedTitle?.slice(0, 54) || sourceLine?.slice(0, 54) || "XUniverse Premium Textbook";

  return {
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
    answerKey: [
      { questionNumber: 1, answer: "핵심 개념을 이해하고 적용하기", explanation: "교재형 출력의 목적은 학습 흐름 전체를 만드는 것입니다." },
      { questionNumber: 2, answer: "해설", explanation: "정답 및 해설 박스를 별도로 렌더링합니다." },
    ],
  };
}

function buildPrompt({ templateId, template, userInstruction, pastedText, uploadedFiles }) {
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
2. 단원별 learningGoals, conceptSummary
3. 필요 시 keyVocabulary, grammarPoints, examples
4. questions에는 객관식, 빈칸, 단답형, 서술형 등을 사용자 주문에 맞춰 섞기
5. 모든 questions에는 answer와 explanation 포함
6. answerKey 포함
7. templateId는 "${templateId}" 그대로 사용

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
        textbook: mockTextbook({ templateId, template, userInstruction, pastedText, uploadedFiles }),
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
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are an expert educational textbook editor for Xtudy-Universe. Return only valid JSON. Never copy EBS or any publisher's logo, proprietary layout, or exact branding.",
          },
          { role: "user", content: buildPrompt({ templateId, template, userInstruction, pastedText, uploadedFiles }) },
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
      textbook: {
        ...textbook,
        templateId,
        brandLabel: textbook.brandLabel || "Xtudy-Universe · AI Learning Platform",
      },
      meta: { model, source: "openai" },
    });
  } catch (error) {
    console.error("[generate-premium-textbook]", error);
    res.status(500).json({ error: "프리미엄 교재 생성 중 오류가 발생했습니다." });
  }
}
