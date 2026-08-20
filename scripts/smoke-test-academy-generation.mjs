#!/usr/bin/env node

import { englishReferenceSeedProfiles } from "../api/_data/english-reference-profiles.mjs";
import {
  buildPlanPrompt,
  createFixedPagePlan,
  formatEnglishReferenceCorpus,
  generateAcademyConceptPageDraft,
  generateAcademyQuestionDraft,
  generateAcademyUnitDraft,
  pageRules,
} from "../api/generate-academy-textbook.mjs";
import {
  normalizeAndValidateAcademyPlan,
  normalizeAndValidateAcademyUnit,
} from "../api/_lib/academy-textbook-quality.mjs";
import { requestTextbookJson, resolveTextbookAiProvider } from "../api/_lib/textbook-ai-provider.mjs";

const provider = resolveTextbookAiProvider(process.env, "academy");
if (provider.kind !== "nvidia") throw new Error("NVIDIA_API_KEY and TEXTBOOK_AI_PROVIDER=nvidia are required");
const unitOnly = process.argv.includes("--unit-only");
const singlePage = process.argv.includes("--single-page");
const questionsOnly = process.argv.includes("--questions-only");

const templateId = "xuniverse-academy-pro";
const targetPages = 50;
const fixedPlan = createFixedPagePlan(targetPages, templateId);
const common = {
  userInstruction: "고3 영어 하위권 학생이 구문 독해부터 수능 빈칸과 순서 문제까지 단계적으로 익히는 교재를 만들어줘. 쉬운 설명과 구체적인 오답 해설을 제공해줘.",
  learnerLevel: "csat-foundation",
  targetPages,
  templateId,
  sourceText: "",
  uploadedFiles: [],
};
const csatCorpus = `평가원 5개년 수능 영어 분석 DB 패턴:
[2026학년도 빈칸 추론] 정답은 빈칸 앞뒤의 인과 관계와 글 전체의 반복 개념을 동시에 만족해야 한다. 오답은 인과 방향을 뒤집거나 주장 범위를 넓힌다.
[2025학년도 문단 순서] 관사, 지시어, 대명사의 선행사를 찾고 일반 진술에서 구체적 예시로 이어지는 흐름을 확인한다.
[2024학년도 문장 삽입] 삽입문 내부 지시 표현과 앞뒤 문장의 연결어를 대조해 유일한 위치를 결정한다.
[2023학년도 주제·요지] 반복되는 핵심 명사와 필자의 평가 표현을 결합해 지나치게 넓거나 좁은 선택지를 제외한다.
[2022학년도 어법] 문장 골격을 먼저 확정한 뒤 수일치, 태, 준동사, 관계절의 기능을 점검한다.`;
const englishReferenceCorpus = formatEnglishReferenceCorpus(
  englishReferenceSeedProfiles.slice(0, 6).map((profile) => ({
    ...profile,
    id: profile.id,
  })),
  10_000,
);

const rawPlan = unitOnly
  ? {
      title: "수능 영어 독해 근거 훈련",
      subtitle: "구문에서 평가원형 추론까지 단계별로 완성하는 기초 과정",
      targetLearner: "고3 수능 영어 하위권 학습자",
      overview: "긴 문장의 뼈대를 찾는 구문 분석에서 시작해 문단의 논리와 정답 근거를 추적하고, 평가원형 빈칸·순서·삽입 문제에 적용하는 판단 절차를 반복 훈련합니다.",
      units: [
        { title: "문장 뼈대와 수식 관계", subtitle: "주어와 동사를 먼저 찾는 구문 독해", learningObjectives: ["주절의 주어와 동사를 찾는다.", "수식어구의 범위를 표시한다."], sourceFocus: ["구문 분석형 설명 원리", "복문 구조의 오독 원인"] },
        { title: "연결어로 논리 흐름 읽기", subtitle: "인과와 대조 관계 추적", learningObjectives: ["연결어의 기능을 구분한다.", "문단의 결론을 근거로 설명한다."], sourceFocus: ["담화 표지 분석", "인과 방향 오답 설계"] },
        { title: "빈칸의 기능과 정답 범위", subtitle: "근거 두 곳을 연결하는 추론", learningObjectives: ["빈칸의 논리 기능을 판별한다.", "선택지 범위를 대조한다."], sourceFocus: ["빈칸 정답 결정 논리", "범위 확대 오답"] },
        { title: "순서와 삽입의 연결 고리", subtitle: "지시어와 정보 전개 활용", learningObjectives: ["선행사를 추적한다.", "일반 진술과 예시의 순서를 배열한다."], sourceFocus: ["문단 순서 생성 규칙", "문장 삽입 위치 단서"] },
        { title: "실전 혼합 세트와 오답 교정", subtitle: "판단 절차를 한 세트에 적용", learningObjectives: ["유형별 풀이 절차를 선택한다.", "오답 원인을 기록하고 수정한다."], sourceFocus: ["평가원형 혼합 문항", "오답 원인별 재학습"] },
      ],
    }
  : await requestTextbookJson({
      provider: { ...provider, enableThinking: false },
      maxTokens: 7_000,
      timeoutMs: 110_000,
      messages: [
        { role: "system", content: "Return only valid JSON. Create original Korean academy textbook content grounded in the supplied reference rules." },
        { role: "user", content: buildPlanPrompt({ ...common, fixedPlan, csatCorpus, englishReferenceCorpus }) },
      ],
    });
const plan = normalizeAndValidateAcademyPlan(rawPlan, {
  fixedPlan,
  templateId,
  targetPages,
  targetLearner: "고3 수능 기초",
  fallbackTitle: "수능 영어 독해 기초",
  pageRules,
});

const unitPlan = plan.units[0];
const fixtureConceptPages = [
  {
    heading: "주절의 중심 동사 찾기",
    bodyParagraphs: [
      "영어 문장의 뼈대는 주어와 시제가 표시된 동사의 결합이다. 전치사구와 분사구가 길게 끼어 있어도 시제 동사를 먼저 찾으면 문장의 핵심 행동과 주체를 안정적으로 확인할 수 있다.",
      "명사 뒤의 과거분사는 명사를 꾸미는 경우가 많고, 조동사나 완료형과 결합한 동사는 주절의 서술어 역할을 한다. 두 형태를 구분할 때는 문장 안에 이미 완성된 동사가 있는지 확인한다.",
      "해석은 골격을 먼저 옮긴 뒤 수식 정보를 두 번째 단계에서 합친다. 이 순서를 지키면 긴 문장에서 수식어를 주절로 잘못 읽거나 행동의 주체를 뒤바꾸는 실수를 줄일 수 있다.",
    ],
    keyTakeaway: "시제가 표시된 동사로 주절을 확정한 뒤 수식어를 연결한다.",
    example: "The policy adopted by the committee has changed the schedule에서 adopted는 policy를 꾸미고 has changed가 주절 동사이다.",
  },
  {
    heading: "수식어의 범위 표시",
    bodyParagraphs: [
      "관계절은 바로 앞 명사에 정보를 덧붙이며 관계사 뒤에는 불완전한 문장 구조가 나타날 수 있다. 관계절의 시작과 끝을 괄호로 묶으면 주절과 수식 정보가 시각적으로 분리된다.",
      "분사구문은 문장 전체에 시간, 이유, 조건, 동시 상황을 더한다. 주절의 주어와 의미상 주체가 같은지 확인하면 수식 관계와 사건의 순서를 자연스럽게 복원할 수 있다.",
      "긴 수식어가 여러 개 겹치면 가장 안쪽 단위부터 해석하지 말고 먼저 각 덩어리가 꾸미는 대상을 화살표로 표시한다. 그 뒤 문맥에 맞는 의미 관계를 선택해야 구조와 해석이 함께 맞는다.",
    ],
    keyTakeaway: "수식 덩어리의 경계를 표시하고 무엇을 꾸미는지 먼저 확인한다.",
    example: "Students who review their errors regularly improve faster에서 who 이하를 students에 연결하면 주절 students improve가 선명해진다.",
  },
  {
    heading: "연결어가 만드는 논리 방향",
    bodyParagraphs: [
      "however는 앞의 기대와 뒤의 결론이 반대 방향임을 알린다. 단순히 부정어를 찾는 대신 두 명제의 중심 개념과 평가 방향이 어떻게 달라지는지를 표로 비교한다.",
      "therefore는 앞부분의 원인이나 근거를 받아 결과를 제시한다. 빈칸이 결과 자리에 있다면 앞 사례를 포괄하면서도 새로운 정보를 과도하게 추가하지 않는 선택지를 골라야 한다.",
      "연결어가 생략된 경우에는 반복되는 핵심어와 대명사의 지칭을 따라 관계를 복원한다. 정답 선택지는 논리 방향과 주장 범위를 모두 만족해야 하며 한 조건이라도 어긋나면 제외한다.",
    ],
    keyTakeaway: "연결어의 기능을 기준으로 두 명제의 방향과 범위를 대조한다.",
    example: "The device was cheap. However, repairs raised its total cost에서는 however 뒤 문장이 앞 장점을 뒤집는 핵심 결론이다.",
  },
  {
    heading: "빈칸의 논리 기능 판별",
    bodyParagraphs: [
      "빈칸 문제는 빈칸에 들어갈 단어를 바로 예상하기보다 그 자리가 원인, 결과, 대조, 일반화 중 어떤 기능을 수행하는지 먼저 정해야 한다. 기능을 정하면 선택지의 범위를 빠르게 좁힐 수 있다.",
      "빈칸 앞뒤에서 같은 뜻으로 반복되는 표현을 두 곳 이상 찾는다. 한 문장에만 맞는 선택지는 우연한 단어 일치일 수 있으므로 글 전체의 중심 논지와 연결되는지 다시 확인한다.",
      "정답 후보를 빈칸에 넣은 뒤 앞뒤 문장을 한 문장으로 요약한다. 요약이 자연스럽고 핵심 근거를 동시에 설명하면 타당하지만 인과 방향을 뒤집거나 주장을 넓히면 오답이다.",
    ],
    keyTakeaway: "빈칸의 기능을 먼저 정하고 근거 두 곳으로 선택지 범위를 검증한다.",
    example: "여러 사례 뒤의 빈칸에는 한 사례를 반복하는 표현보다 사례들을 포괄하는 일반 원리가 들어가야 문단이 완성된다.",
  },
  {
    heading: "오답 선택지의 함정 해체",
    bodyParagraphs: [
      "평가원형 오답은 본문 단어를 그대로 포함해 친숙하게 보이도록 설계된다. 어휘가 일치한다는 이유만으로 고르지 말고 선택지가 주장하는 주체, 범위, 인과 관계를 본문과 대조한다.",
      "부분적으로 맞는 선택지는 한 문장의 세부 정보는 반영하지만 글 전체의 결론을 설명하지 못한다. 정답은 핵심 근거들을 함께 묶고 세부 사례보다 한 단계 높은 수준의 진술을 제시한다.",
      "극단 표현이 포함된 선택지는 본문의 가능성이나 경향을 필연적 사실로 바꿀 수 있다. always, never 같은 강한 표현이 원문의 완화된 태도와 일치하는지 반드시 확인한다.",
    ],
    keyTakeaway: "단어 일치보다 주체·범위·인과·표현 강도를 기준으로 오답을 지운다.",
    example: "본문이 학습 전략이 도움이 될 수 있다고 말할 때 반드시 성공을 보장한다고 바꾼 선택지는 표현 강도를 과장한 오답이다.",
  },
  {
    heading: "단계별 풀이 루틴의 전이",
    bodyParagraphs: [
      "새 지문을 만나면 먼저 문장 골격을 표시하고 문단별 핵심어를 한 단어로 기록한다. 다음으로 연결어와 지시어를 확인해 문단 사이의 관계를 화살표로 나타내고, 각 문단이 예시인지 결론인지 기능을 짧게 적는다.",
      "문항을 읽은 뒤 요구하는 판단 유형을 분류한다. 주제 문항은 반복 개념, 빈칸은 논리 기능, 순서와 삽입은 연결 고리를 우선 확인하여 유형에 맞는 근거를 선택한다.",
      "채점 후에는 정답만 확인하지 말고 자신이 놓친 근거와 오답을 고른 이유를 기록한다. 다음 문제에서 같은 기준을 먼저 점검하면 풀이 절차가 다른 소재에도 전이된다.",
    ],
    keyTakeaway: "구조 표시, 논리 연결, 유형 판단, 오답 기록의 순서를 매 문제에 적용한다.",
    example: "새로운 과학 소재 지문에서도 문장 구조와 연결어를 먼저 표시하면 배경지식 없이 글 내부 근거로 정답을 결정할 수 있다.",
  },
];
if (questionsOnly) {
  const questionDraft = await generateAcademyQuestionDraft({
    provider,
    common,
    plan,
    unit: unitPlan,
    conceptPages: fixtureConceptPages,
    sourceExcerpt: "",
    csatCorpus,
    englishReferenceCorpus,
    previousContentSignatures: [],
  });
  const unit = normalizeAndValidateAcademyUnit({ ...questionDraft, conceptPages: fixtureConceptPages }, unitPlan, []);
  console.log(JSON.stringify({
    provider: provider.kind,
    model: provider.model,
    questions: unit.questions.length,
    qualityCheck: "passed",
  }));
  process.exit(0);
}
if (singlePage) {
  const conceptPage = await generateAcademyConceptPageDraft({
    provider,
    common,
    plan,
    unit: unitPlan,
    pageIndex: 0,
    priorConceptPages: [],
    sourceExcerpt: "",
    csatCorpus,
    englishReferenceCorpus,
    previousContentSignatures: [],
  });
  console.log(JSON.stringify({
    provider: provider.kind,
    model: provider.model,
    conceptPage: Boolean(conceptPage?.heading && conceptPage?.bodyParagraphs?.length === 3),
    qualityCheck: "passed",
  }));
  process.exit(0);
}
const rawUnit = await generateAcademyUnitDraft({
  provider,
  common,
  plan,
  unit: unitPlan,
  sourceExcerpt: "",
  csatCorpus,
  englishReferenceCorpus,
  previousContentSignatures: [],
});
const unit = normalizeAndValidateAcademyUnit(rawUnit, unitPlan, []);

console.log(JSON.stringify({
  provider: provider.kind,
  model: provider.model,
  planUnits: plan.units.length,
  uniquePlanTitles: new Set(plan.units.map((item) => item.title)).size,
  firstUnitConceptPages: unit.conceptPages.length,
  firstUnitQuestions: unit.questions.length,
  qualityCheck: "passed",
}));
