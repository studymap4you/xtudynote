import assert from "node:assert/strict";
import test from "node:test";
import {
  AcademyTextbookQualityError,
  instructionLeakageIssues,
  normalizeAndValidateAcademyPlan,
  normalizeAndValidateAcademyUnit,
  validateCsatBlankInferenceQuestion,
} from "../api/_lib/academy-textbook-quality.mjs";
import {
  buildAcademyDifficultySequence,
  buildAcademyRevisionContext,
  buildUnitPrompt,
  isCsatEnglishReadingRequest,
  resolveAcademyDifficultyPolicy,
  selectCsatReferencePatterns,
  selectEnglishReferenceProfiles,
  spliceAcademyRevisionParts,
} from "../api/generate-academy-textbook.mjs";
import { examTextbookBlueprintProfiles } from "../api/_data/exam-textbook-blueprints.mjs";

const fixedPlan = {
  unitCount: 2,
  questionsPerUnit: 4,
  totalQuestions: 8,
  conceptPagesByUnit: [3, 3],
  pageAllocation: { frontMatter: 2, unitOpeners: 2, conceptPages: 6, practicePages: 2, answerPages: 1, total: 13 },
};
const pageRules = () => ({ questionsPerPage: 4, answersPerPage: 8 });

test("accepts a complete, distinct academy plan", () => {
  const plan = normalizeAndValidateAcademyPlan(
    {
      title: "수능 독해 근거 찾기",
      subtitle: "구문에서 빈칸 추론까지 이어지는 단계별 영어 독해",
      targetLearner: "고3 수능 기초 학습자",
      overview: "문장 구조를 정확히 나누는 연습에서 출발하여 문단의 논리 관계와 핵심 근거를 찾고, 이를 평가원형 독해 문제의 판단 절차에 적용하도록 설계한 과정입니다.",
      units: [
        {
          title: "문장 뼈대와 수식 관계",
          subtitle: "주어와 동사를 먼저 찾는 구문 독해",
          learningObjectives: ["긴 문장에서 주절의 주어와 동사를 찾는다.", "수식어구를 분리해 핵심 의미를 복원한다."],
          sourceFocus: ["구문 분석형 교육자료의 단계별 설명", "평가원 독해 지문의 복문 구조"],
        },
        {
          title: "연결어로 문단 논리 추적",
          subtitle: "인과와 대조를 근거로 빈칸 판단하기",
          learningObjectives: ["접속 표현이 만드는 논리 관계를 구분한다.", "빈칸 앞뒤의 근거를 연결해 답을 고른다."],
          sourceFocus: ["빈칸 문항의 정답 결정 논리", "오답 선택지의 범위와 극성 오류"],
        },
      ],
    },
    {
      fixedPlan,
      templateId: "xuniverse-academy-pro",
      targetPages: 50,
      targetLearner: "고3 수능 기초",
      fallbackTitle: "영어 교재",
      pageRules,
    },
  );
  assert.equal(plan.units.length, 2);
});

test("rejects the former placeholder plan", () => {
  assert.throws(
    () => normalizeAndValidateAcademyPlan(
      {
        title: "고3 수능 준비 교재 만들어줘",
        subtitle: "개념과 문제 완성",
        targetLearner: "고3",
        overview: "같은 내용을 반복해서 분량을 채우는 짧은 설명입니다.",
        units: Array.from({ length: 2 }, (_, index) => ({
          title: `${index + 1}단원 핵심 주제 ${index + 1}`,
          subtitle: "개념 이해에서 실전 적용까지",
          learningObjectives: ["핵심 개념을 설명한다.", "문제에 적용한다."],
          sourceFocus: [`자료의 ${index + 1}번째 핵심 개념`, "대표 출제 유형"],
        })),
      },
      {
        fixedPlan,
        templateId: "xuniverse-academy-pro",
        targetPages: 50,
        targetLearner: "고3",
        fallbackTitle: "영어 교재",
        pageRules,
      },
    ),
    AcademyTextbookQualityError,
  );
});

const distinctParagraphs = [
  [
    "영어 문장의 중심은 주어와 서술 동사의 결합이다. 전치사구와 분사구가 길게 끼어 있어도 먼저 시제가 표시된 동사를 찾으면 주절의 뼈대를 안정적으로 확인할 수 있다.",
    "주절을 찾은 뒤에는 명사 뒤에서 정보를 덧붙이는 관계절과 앞 문장 전체를 보충하는 분사구문을 구분한다. 무엇을 꾸미는지 화살표로 표시하면 해석 범위가 분명해진다.",
    "실전에서는 모든 단어를 순서대로 번역하기보다 핵심 골격을 먼저 읽고 수식 정보를 두 번째 단계에서 합친다. 이 절차는 긴 문장에서 주체와 행동을 뒤바꾸는 오류를 줄인다.",
  ],
  [
    "however는 앞의 기대와 뒤의 결론이 반대 방향임을 알리는 신호다. 단순히 부정어를 찾는 대신 두 명제의 중심 개념과 평가 방향이 어떻게 달라지는지 비교해야 한다.",
    "therefore는 앞부분이 원인이나 근거이고 뒷부분이 그 결과임을 표시한다. 빈칸이 결과 자리에 놓였다면 앞 문장의 사례를 포괄하는 결론인지 범위를 대조해야 한다.",
    "연결어가 생략된 문단에서도 반복되는 핵심어와 대명사의 지칭을 따라가면 관계를 복원할 수 있다. 선택지는 이 논리 방향과 범위를 모두 만족할 때만 정답이 되며, 한 조건이라도 어긋나면 오답으로 제외한다.",
  ],
  [
    "빈칸 문제의 정답은 글의 소재를 언급하는 선택지가 아니라 필자가 빈칸에서 수행하는 논리 기능을 완성하는 선택지다. 먼저 빈칸이 원인, 결과, 대조 중 어디에 놓였는지 판별한다.",
    "오답은 본문에 등장한 단어를 포함해 친숙하게 보이지만 주장 범위를 지나치게 넓히거나 인과의 방향을 뒤집는 경우가 많다. 단어 일치보다 명제 관계를 우선해 비교한다.",
    "최종 검토에서는 선택지를 빈칸에 넣어 앞뒤 문장을 한 문장으로 요약한다. 요약이 자연스럽고 핵심 근거 두 곳을 동시에 설명하면 정답 가능성이 높으며, 새로운 정보가 갑자기 추가되면 오답을 의심한다.",
  ],
];

test("rejects repeated concept filler in a generated unit", () => {
  const repeated = "문장의 핵심 개념을 자료의 맥락과 연결해 설명합니다. 정의와 적용 조건을 구분하면 새로운 문제에서도 같은 판단 기준을 사용할 수 있습니다.";
  assert.throws(
    () => normalizeAndValidateAcademyUnit(
      {
        unitTitle: "문장 구조",
        unitSubtitle: "기초 독해",
        learningGoals: ["구조를 찾는다.", "근거를 설명한다."],
        conceptSummary: "문장 구조를 분석하여 독해에 적용하는 과정을 충분히 설명하는 요약문이지만 아래 내용은 반복되는 임시 보충 문구로 구성되어 품질 검사를 통과하면 안 됩니다.",
        conceptPages: Array.from({ length: 3 }, (_, index) => ({
          heading: `문장 구조 ${index + 1}`,
          bodyParagraphs: [repeated, repeated, repeated],
          keyTakeaway: "주어와 동사를 먼저 찾은 뒤 수식 관계를 확인합니다.",
          example: "긴 문장에서 핵심 동사를 표시하고 수식어를 괄호로 묶어 구조를 확인하는 예시입니다.",
        })),
        questions: [],
      },
      { conceptPageCount: 3, questionCount: 4 },
    ),
    AcademyTextbookQualityError,
  );
});

test("accepts a complete unit and rejects similarity to prior units", () => {
  const raw = {
    unitTitle: "논리 연결과 빈칸 추론",
    unitSubtitle: "연결어를 근거로 정답 범위를 좁히기",
    learningGoals: ["인과와 대조 관계를 구분한다.", "근거 문장을 이용해 빈칸 선택지를 평가한다."],
    conceptSummary: "문장 구조를 확인한 뒤 연결 표현과 핵심어 반복을 이용해 문단의 논리를 복원하고, 빈칸의 기능과 선택지의 범위를 대조하는 단계별 판단 절차를 익힙니다.",
    conceptPages: distinctParagraphs.map((bodyParagraphs, index) => ({
      heading: ["주절의 골격 찾기", "연결어로 방향 읽기", "빈칸 선택지 검증"][index],
      bodyParagraphs,
      keyTakeaway: ["시제가 표시된 동사로 주절을 먼저 확정한 뒤 수식어의 범위를 연결한다.", "연결어의 방향과 두 명제의 범위를 함께 비교하여 결론을 확정한다.", "빈칸의 논리 기능과 선택지의 주장 범위를 근거 문장과 대조한다."][index],
      example: [
        "The policy adopted by the committee has changed the schedule에서 adopted by the committee를 수식어로 분리하면 has changed가 주절 동사임을 확인할 수 있다.",
        "The device was inexpensive. However, frequent repairs increased its total cost에서 however 뒤 문장이 앞의 장점을 뒤집는 핵심 결론이다.",
        "개별 사례 뒤의 빈칸에는 사례를 그대로 반복하는 문장보다 여러 사례를 포괄하는 일반 원리를 넣어야 문단의 결론이 완성된다.",
      ][index],
    })),
    questions: [
      { type: "multiple-choice", question: "다음 문장에서 주절의 서술 동사로 가장 적절한 것은 무엇인가?", choices: ["adopted", "committee", "has changed", "schedule"], answer: "has changed", explanation: "adopted는 policy를 꾸미는 과거분사이고 시제가 표시된 has changed가 주어 policy와 결합한 주절의 서술 동사이므로 정답이다.", difficulty: "easy" },
      { type: "multiple-choice", question: "however가 사용된 문단에서 필자가 강조하는 내용은 일반적으로 어느 위치에 놓이는가?", choices: ["역접 뒤의 결론", "첫 사례의 세부 수치", "문단 밖의 배경 정보", "인용문의 출처"], answer: "역접 뒤의 결론", explanation: "however는 앞의 기대를 뒤집는 신호이므로 뒤에 이어지는 명제가 필자의 핵심 판단을 담는 경우가 많다. 나머지는 역접 기능과 직접 관련이 없다.", difficulty: "easy" },
      { type: "blank", question: "빈칸이 여러 사례 뒤에 놓였을 때 정답 선택지가 갖추어야 할 핵심 조건을 쓰시오.", choices: [], answer: "앞의 여러 사례를 포괄하는 일반화된 결론이어야 한다.", explanation: "사례 나열 뒤의 빈칸은 개별 표현을 반복하기보다 사례들이 공통으로 보여 주는 원리나 결론을 제시해야 문단 논리가 완성된다.", difficulty: "medium" },
      { type: "short-answer", question: "빈칸 선택지를 검토할 때 단어 일치보다 먼저 비교해야 하는 두 요소를 쓰시오.", choices: [], answer: "논리 방향과 주장 범위", explanation: "평가원형 오답은 본문 어휘를 포함하면서도 인과를 뒤집거나 주장의 범위를 넓히는 방식으로 설계되므로 방향과 범위를 먼저 확인해야 한다.", difficulty: "medium" },
    ],
  };
  const unit = normalizeAndValidateAcademyUnit(raw, { conceptPageCount: 3, questionCount: 4 });
  assert.equal(unit.questions.length, 4);
  assert.throws(
    () => normalizeAndValidateAcademyUnit(raw, { conceptPageCount: 3, questionCount: 4 }, [`concept:${distinctParagraphs[0][0]}`]),
    AcademyTextbookQualityError,
  );
});

test("keeps the user order out of the printable unit-writing prompt", () => {
  const userInstruction = "고등학교 3학년 중위권 학생을 위한 영어 독해 교재 제작해줘";
  const prompt = buildUnitPrompt({
    userInstruction,
    learnerLevel: "csat-foundation",
    plan: { title: "근거 중심 수능 독해", targetLearner: "고3 중위권" },
    unit: {
      unitIndex: 0,
      title: "빈칸의 논리 기능",
      subtitle: "인과와 대조를 근거로 판단하기",
      learningObjectives: ["빈칸의 기능을 판별한다.", "오답의 범위 오류를 찾는다."],
      sourceFocus: ["평가원 빈칸 정답 결정 논리", "장문 독해 오답 설계"],
      conceptPageCount: 1,
      questionCount: 1,
    },
    sourceExcerpt: "",
    csatCorpus: "빈칸 앞뒤의 인과와 반복 개념을 대조한다.",
    englishReferenceCorpus: "정의, 예시, 적용 순서로 설명한다.",
    wordnetCorpus: "",
    previousContentSignatures: [],
  });
  assert.equal(prompt.includes(userInstruction), false);
  assert.deepEqual(instructionLeakageIssues(`교재 본문: ${userInstruction}`, userInstruction), [
    "생성 결과에 사용자 주문 문장이 그대로 복사되었습니다.",
  ]);
});

test("prioritizes blank-inference references for a general high-school reading request", () => {
  const instruction = "고등학교 3학년 중위권 학생을 위한 영어 독해 교재";
  assert.equal(isCsatEnglishReadingRequest(instruction), true);
  const patterns = [
    { id: "topic", questionType: "topic", examYear: 2026, score: 2 },
    { id: "blank-2026", questionType: "blank-inference", examYear: 2026, score: 3 },
    { id: "blank-2025", questionType: "blank-inference", examYear: 2025, score: 3 },
    { id: "grammar", questionType: "grammar", examYear: 2026, score: 3 },
  ];
  const selected = selectCsatReferencePatterns(patterns, instruction, 2);
  assert.deepEqual(selected.map((item) => item.id), ["blank-2026", "blank-2025"]);
});

test("accepts only long five-choice CSAT blank-inference questions", () => {
  const passage = Array.from(
    { length: 135 },
    (_, index) => (index === 70 ? "__________" : `word${index}`),
  ).join(" ");
  const valid = {
    question: `다음 글의 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.\n\n${passage}`,
    choices: ["a careful generalization", "an unrelated detail", "a reversed cause", "an extreme claim", "a partial repetition"],
    explanation: "빈칸 앞의 사례와 뒤의 결론이 같은 일반화 원리를 가리키므로 첫 번째 선택지가 정답이다. 두 번째는 무관한 세부 정보이고, 세 번째는 인과를 뒤집으며, 네 번째는 범위를 과장하고, 다섯 번째는 일부 사례만 반복한다.",
  };
  assert.deepEqual(validateCsatBlankInferenceQuestion(valid), []);
  assert.ok(validateCsatBlankInferenceQuestion({ ...valid, question: "Short __________ passage", choices: valid.choices.slice(0, 4) }).length >= 2);
});

test("keeps revision feedback as an instruction and replaces only the selected slice", () => {
  const existingConcept = { heading: "기존 개념", bodyParagraphs: ["기존 설명"], keyTakeaway: "기존 정리" };
  const revisedConcept = { heading: "수정 개념", bodyParagraphs: ["수정 설명"], keyTakeaway: "수정 정리" };
  const conceptPages = [existingConcept, { heading: "유지할 개념" }];
  const questions = [{ question: "유지할 첫 문항" }, { question: "유지할 두 번째 문항" }];
  const feedback = "설명을 더 쉽게 바꾸되 다른 페이지는 그대로 둬";
  const context = buildAcademyRevisionContext(feedback, existingConcept);
  assert.match(context, /지정된 조각 하나만 다시 작성/);
  assert.match(context, new RegExp(feedback));
  assert.match(context, /기존 개념/);

  const patched = spliceAcademyRevisionParts({
    conceptPages,
    questions,
    target: { unitIndex: 0, partType: "concept", partIndex: 0, label: "1단원 개념 페이지 1" },
    revisedPart: revisedConcept,
  });
  assert.equal(patched.conceptPages[0], revisedConcept);
  assert.equal(patched.conceptPages[1], conceptPages[1]);
  assert.equal(patched.questions[0], questions[0]);
  assert.equal(patched.questions[1], questions[1]);

  const revisedQuestion = { question: "수정한 두 번째 문항" };
  const questionPatched = spliceAcademyRevisionParts({
    conceptPages,
    questions,
    target: { unitIndex: 0, partType: "question", partIndex: 1, label: "1단원 문항 2" },
    revisedPart: revisedQuestion,
  });
  assert.equal(questionPatched.conceptPages[0], conceptPages[0]);
  assert.equal(questionPatched.conceptPages[1], conceptPages[1]);
  assert.equal(questionPatched.questions[0], questions[0]);
  assert.equal(questionPatched.questions[1], revisedQuestion);
});

test("enforces the lower-level 60:40 difficulty mix without hard questions", () => {
  const policy = resolveAcademyDifficultyPolicy({
    learnerLevel: "auto",
    userInstruction: "고3 하위권 학생을 위한 수능 영어 독해 교재",
  });
  const sequence = buildAcademyDifficultySequence(policy, 30);
  assert.equal(sequence.filter((difficulty) => difficulty === "easy").length, 18);
  assert.equal(sequence.filter((difficulty) => difficulty === "medium").length, 12);
  assert.equal(sequence.filter((difficulty) => difficulty === "hard").length, 0);
  assert.ok(sequence.slice(0, 10).includes("easy"));
  assert.ok(sequence.slice(0, 10).includes("medium"));
});

test("enforces the middle-level 60:40 mix and prioritizes the two exam blueprints", () => {
  const policy = resolveAcademyDifficultyPolicy({
    learnerLevel: "auto",
    userInstruction: "고등학교 3학년 중위권 학생용 수능 영어 문제집",
  });
  const sequence = buildAcademyDifficultySequence(policy, 30);
  assert.equal(sequence.filter((difficulty) => difficulty === "medium").length, 18);
  assert.equal(sequence.filter((difficulty) => difficulty === "hard").length, 12);

  const selected = selectEnglishReferenceProfiles(
    [
      ...examTextbookBlueprintProfiles,
      {
        ...examTextbookBlueprintProfiles[0],
        id: "generic-syntax",
        title: "일반 구문 자료",
        category: "syntax-answer-guide",
        keywords: ["구문"],
      },
    ],
    "고3 중위권 수능 영어 독해 교재를 만들어줘",
    2,
  );
  assert.deepEqual(selected.map((profile) => profile.id).sort(), examTextbookBlueprintProfiles.map((profile) => profile.id).sort());
});
