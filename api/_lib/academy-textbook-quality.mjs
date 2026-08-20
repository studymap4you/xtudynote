const QUESTION_TYPES = new Set(["multiple-choice", "short-answer", "blank", "essay", "matching", "ordering"]);
const DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const PLACEHOLDER_PATTERNS = [
  /핵심\s*주제\s*\d+/i,
  /자료의\s*\d+번째\s*핵심\s*개념/i,
  /정답을\s*먼저\s*정한\s*뒤\s*근거를\s*끼워\s*맞춘다/i,
  /자료와\s*무관한\s*배경지식만으로\s*판단한다/i,
  /정의와\s*적용\s*조건을\s*구분하면\s*새로운\s*문제에서도/i,
  /조건,?\s*근거,?\s*적용\s*순서로\s*정리/i,
];

export class AcademyTextbookQualityError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "AcademyTextbookQualityError";
    this.code = "academy-quality-check-failed";
    this.details = details;
  }
}

function text(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function stringArray(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

function comparable(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function characterNgrams(value, size = 3) {
  const normalized = comparable(value);
  if (normalized.length <= size) return new Set(normalized ? [normalized] : []);
  const grams = new Set();
  for (let index = 0; index <= normalized.length - size; index += 1) {
    grams.add(normalized.slice(index, index + size));
  }
  return grams;
}

export function contentSimilarity(left, right) {
  const a = characterNgrams(left);
  const b = characterNgrams(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const gram of a) if (b.has(gram)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function includesPlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(String(value ?? "")));
}

export function instructionLeakageIssues(value, userInstruction, label = "생성 결과") {
  const instruction = comparable(userInstruction);
  const output = comparable(value);
  if (instruction.length < 12 || output.length < 12) return [];
  if (output.includes(instruction)) return [`${label}에 사용자 주문 문장이 그대로 복사되었습니다.`];
  return [];
}

function englishWordCount(value) {
  return String(value ?? "").match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0;
}

export function validateCsatBlankInferenceQuestion(raw, label = "빈칸 추론 문항") {
  const issues = [];
  const question = text(raw?.question, 12_000);
  const choices = stringArray(raw?.choices, 6, 500);
  const explanation = text(raw?.explanation, 2_000);
  if (englishWordCount(question) < 120) issues.push(`${label}의 영어 지문은 최소 120단어 이상이어야 합니다.`);
  if (!/_{4,}|\[\s*BLANK\s*\]|\(\s*blank\s*\)/i.test(question)) {
    issues.push(`${label}의 지문에 명확한 빈칸 표시가 없습니다.`);
  }
  if (choices.length !== 5) issues.push(`${label}의 선택지는 평가원 형식에 맞게 정확히 5개여야 합니다.`);
  if (new Set(choices.map(comparable)).size !== choices.length) issues.push(`${label}의 선택지가 중복됩니다.`);
  if (explanation.length < 100) issues.push(`${label}의 해설은 정답 근거와 주요 오답 이유를 충분히 설명해야 합니다.`);
  return issues;
}

function collectNearDuplicates(values, threshold, label) {
  const issues = [];
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      if (contentSimilarity(values[left], values[right]) >= threshold) {
        issues.push(`${label} ${left + 1}과 ${right + 1}이 지나치게 유사합니다.`);
      }
    }
  }
  return issues;
}

function previousByKind(signatures, kind) {
  const prefix = `${kind}:`;
  return Array.isArray(signatures)
    ? signatures
        .map((item) => text(item, 700))
        .filter((item) => item.startsWith(prefix))
        .map((item) => item.slice(prefix.length))
        .filter(Boolean)
    : [];
}

function assertDistinctFromPrevious(current, previous, threshold, label, issues) {
  current.forEach((item, index) => {
    if (previous.some((prior) => contentSimilarity(item, prior) >= threshold)) {
      issues.push(`${label} ${index + 1}이 이전 단원의 내용과 지나치게 유사합니다.`);
    }
  });
}

export function normalizeAndValidateAcademyPlan(raw, {
  fixedPlan,
  templateId,
  targetPages,
  targetLearner,
  fallbackTitle,
  pageRules,
  userInstruction = "",
}) {
  const issues = [];
  const rawUnits = Array.isArray(raw?.units) ? raw.units : [];
  if (rawUnits.length !== fixedPlan.unitCount) {
    issues.push(`단원 수가 ${rawUnits.length}개입니다. ${fixedPlan.unitCount}개가 필요합니다.`);
  }

  const units = rawUnits.slice(0, fixedPlan.unitCount).map((candidate, index) => {
    const title = text(candidate?.title, 100);
    const subtitle = text(candidate?.subtitle, 160);
    const learningObjectives = stringArray(candidate?.learningObjectives, 5, 240);
    const sourceFocus = stringArray(candidate?.sourceFocus, 8, 180);
    if (title.length < 4) issues.push(`${index + 1}단원 제목이 비어 있거나 너무 짧습니다.`);
    if (subtitle.length < 4) issues.push(`${index + 1}단원 부제가 비어 있거나 너무 짧습니다.`);
    if (learningObjectives.length < 2) issues.push(`${index + 1}단원 학습 목표가 2개 미만입니다.`);
    if (sourceFocus.length < 2) issues.push(`${index + 1}단원 근거 초점이 2개 미만입니다.`);
    if (includesPlaceholder([title, subtitle, ...learningObjectives, ...sourceFocus].join(" "))) {
      issues.push(`${index + 1}단원에 임시 보충 문구가 포함되어 있습니다.`);
    }
    const conceptPageCount = fixedPlan.conceptPagesByUnit[index];
    return {
      id: `unit-${index + 1}`,
      unitIndex: index,
      title,
      subtitle,
      learningObjectives,
      sourceFocus,
      conceptPageCount,
      questionCount: fixedPlan.questionsPerUnit,
      estimatedPages: 1 + conceptPageCount + Math.ceil(fixedPlan.questionsPerUnit / pageRules(templateId).questionsPerPage),
    };
  });

  issues.push(...collectNearDuplicates(units.map((unit) => unit.title), 0.68, "단원 제목"));
  const title = text(raw?.title, 80) || text(fallbackTitle, 80);
  const subtitle = text(raw?.subtitle, 160);
  const overview = text(raw?.overview, 1_400);
  const learner = text(raw?.targetLearner, 240) || targetLearner;
  if (title.length < 4) issues.push("교재 제목이 비어 있거나 너무 짧습니다.");
  if (subtitle.length < 8) issues.push("교재 부제가 비어 있거나 너무 짧습니다.");
  if (overview.length < 80) issues.push("교재 개요가 충분히 구체적이지 않습니다.");
  if (includesPlaceholder([title, subtitle, overview].join(" "))) issues.push("교재 개요에 임시 보충 문구가 포함되어 있습니다.");
  issues.push(...instructionLeakageIssues(
    [title, subtitle, overview, ...units.flatMap((unit) => [unit.title, unit.subtitle, ...unit.learningObjectives, ...unit.sourceFocus])].join("\n"),
    userInstruction,
    "교재 설계",
  ));

  if (issues.length) throw new AcademyTextbookQualityError("교재 설계가 품질 기준을 충족하지 못했습니다.", issues);
  return {
    id: `academy-plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    subtitle,
    targetLearner: learner,
    overview,
    targetPages,
    templateId,
    unitCount: fixedPlan.unitCount,
    questionCount: fixedPlan.totalQuestions,
    pageAllocation: fixedPlan.pageAllocation,
    units,
  };
}

function normalizeQuestion(raw, index, issues, options = {}) {
  const type = text(raw?.type, 40).toLowerCase();
  const question = text(raw?.question, 6_000);
  const answer = text(raw?.answer, 320);
  const explanation = text(raw?.explanation, 700);
  const difficulty = text(raw?.difficulty, 20).toLowerCase();
  if (!QUESTION_TYPES.has(type)) issues.push(`${index + 1}번 문항 유형이 올바르지 않습니다.`);
  if (question.length < 20) issues.push(`${index + 1}번 문항이 비어 있거나 너무 짧습니다.`);
  if (!answer) issues.push(`${index + 1}번 정답이 없습니다.`);
  if (explanation.length < 50) issues.push(`${index + 1}번 해설이 충분히 구체적이지 않습니다.`);
  if (!DIFFICULTIES.has(difficulty)) issues.push(`${index + 1}번 난이도가 올바르지 않습니다.`);
  if (includesPlaceholder([question, answer, explanation].join(" "))) issues.push(`${index + 1}번 문항에 임시 보충 문구가 포함되어 있습니다.`);

  const hasSelectableChoices = type === "multiple-choice" || type === "blank";
  const choices = hasSelectableChoices ? stringArray(raw?.choices, 6, 500) : [];
  if (type === "multiple-choice") {
    if (choices.length < 4) issues.push(`${index + 1}번 객관식 선택지가 4개 미만입니다.`);
    if (new Set(choices.map(comparable)).size !== choices.length) issues.push(`${index + 1}번 객관식 선택지가 중복됩니다.`);
  }
  if (options.requireCsatReading && type === "blank") {
    issues.push(...validateCsatBlankInferenceQuestion(raw, `${index + 1}번 빈칸 추론 문항`));
  }
  return {
    type,
    question,
    ...(choices.length ? { choices } : {}),
    answer,
    explanation,
    difficulty,
  };
}

export function normalizeAndValidateAcademyUnit(raw, unitPlan, previousContentSignatures = [], options = {}) {
  const issues = [];
  const rawConceptPages = Array.isArray(raw?.conceptPages) ? raw.conceptPages : [];
  const rawQuestions = Array.isArray(raw?.questions) ? raw.questions : [];
  if (rawConceptPages.length !== unitPlan.conceptPageCount) {
    issues.push(`개념 페이지가 ${rawConceptPages.length}개입니다. ${unitPlan.conceptPageCount}개가 필요합니다.`);
  }
  if (rawQuestions.length !== unitPlan.questionCount) {
    issues.push(`문항이 ${rawQuestions.length}개입니다. ${unitPlan.questionCount}개가 필요합니다.`);
  }

  const conceptPages = rawConceptPages.slice(0, unitPlan.conceptPageCount).map((page, pageIndex) => {
    const heading = text(page?.heading, 140);
    const bodyParagraphs = stringArray(page?.bodyParagraphs, 3, 620);
    const keyTakeaway = text(page?.keyTakeaway, 700);
    const example = text(page?.example, 1_000);
    if (heading.length < 4) issues.push(`${pageIndex + 1}번째 개념 페이지 제목이 없습니다.`);
    if (bodyParagraphs.length !== 3) issues.push(`${pageIndex + 1}번째 개념 페이지 본문은 3개 문단이어야 합니다.`);
    bodyParagraphs.forEach((paragraph, paragraphIndex) => {
      if (paragraph.length < 90) issues.push(`${pageIndex + 1}번째 개념 페이지 ${paragraphIndex + 1}문단이 너무 짧습니다.`);
    });
    if (keyTakeaway.length < 30) issues.push(`${pageIndex + 1}번째 개념 페이지 핵심 정리가 너무 짧습니다.`);
    if (example.length < 50) issues.push(`${pageIndex + 1}번째 개념 페이지 예시가 너무 짧습니다.`);
    if (includesPlaceholder([heading, ...bodyParagraphs, keyTakeaway, example].join(" "))) {
      issues.push(`${pageIndex + 1}번째 개념 페이지에 임시 보충 문구가 포함되어 있습니다.`);
    }
    issues.push(...collectNearDuplicates(bodyParagraphs, 0.74, `${pageIndex + 1}번째 개념 페이지 문단`));
    return { heading, bodyParagraphs, keyTakeaway, example };
  });

  issues.push(...collectNearDuplicates(conceptPages.map((page) => page.heading), 0.68, "개념 페이지 제목"));
  const allParagraphs = conceptPages.flatMap((page) => page.bodyParagraphs);
  issues.push(...collectNearDuplicates(allParagraphs, 0.78, "개념 설명 문단"));

  const questions = rawQuestions
    .slice(0, unitPlan.questionCount)
    .map((question, index) => normalizeQuestion(question, index, issues, options));
  issues.push(...collectNearDuplicates(questions.map((question) => question.question), 0.72, "문항"));
  assertDistinctFromPrevious(allParagraphs, previousByKind(previousContentSignatures, "concept"), 0.78, "개념 설명", issues);
  assertDistinctFromPrevious(questions.map((question) => question.question), previousByKind(previousContentSignatures, "question"), 0.72, "문항", issues);

  const unitTitle = text(raw?.unitTitle, 140);
  const unitSubtitle = text(raw?.unitSubtitle, 180);
  const learningGoals = stringArray(raw?.learningGoals, 6, 260);
  const conceptSummary = text(raw?.conceptSummary, 3_000);
  if (unitTitle.length < 4) issues.push("단원 제목이 없습니다.");
  if (unitSubtitle.length < 4) issues.push("단원 부제가 없습니다.");
  if (learningGoals.length < 2) issues.push("단원 학습 목표가 2개 미만입니다.");
  if (conceptSummary.length < 80) issues.push("단원 개념 요약이 충분히 구체적이지 않습니다.");
  if (includesPlaceholder([unitTitle, unitSubtitle, conceptSummary].join(" "))) issues.push("단원 요약에 임시 보충 문구가 포함되어 있습니다.");
  issues.push(...instructionLeakageIssues(
    [
      unitTitle,
      unitSubtitle,
      conceptSummary,
      ...learningGoals,
      ...allParagraphs,
      ...questions.flatMap((question) => [question.question, question.answer, question.explanation, ...(question.choices || [])]),
    ].join("\n"),
    options.userInstruction,
    "단원 원고",
  ));

  if (issues.length) throw new AcademyTextbookQualityError("생성된 단원이 품질 기준을 충족하지 못했습니다.", issues);
  return {
    unitTitle,
    unitSubtitle,
    learningGoals,
    conceptSummary,
    conceptPages,
    keyVocabulary: Array.isArray(raw?.keyVocabulary)
      ? raw.keyVocabulary
          .map((item) => ({
            term: text(item?.term, 120),
            meaning: text(item?.meaning, 360),
            example: text(item?.example, 500),
            definitionEn: text(item?.definitionEn, 500),
            senseId: text(item?.senseId, 80),
            source: text(item?.source, 120),
            sourceUrl: text(item?.sourceUrl, 500),
            license: text(item?.license, 80),
          }))
          .filter((item) => item.term && item.meaning)
          .slice(0, 16)
      : [],
    grammarPoints: stringArray(raw?.grammarPoints, 12, 600),
    examples: stringArray(raw?.examples, 12, 800),
    questions,
  };
}

export function normalizeAndValidateAcademyConceptPage(rawPage, previousContentSignatures = []) {
  const unit = normalizeAndValidateAcademyUnit(
    {
      unitTitle: "개념 페이지 품질 검증",
      unitSubtitle: "페이지별 구조와 중복 검사",
      learningGoals: ["개념을 정확히 설명한다.", "새 문제에 판단 절차를 적용한다."],
      conceptSummary:
        "현재 개념 페이지가 충분한 설명과 구체적인 예시를 갖추고 있으며 앞서 생성된 페이지의 표현과 사고 과정을 반복하지 않는지 확인하기 위한 내부 품질 검증입니다.",
      conceptPages: [rawPage],
      keyVocabulary: [],
      grammarPoints: [],
      examples: [],
      questions: [],
    },
    { conceptPageCount: 1, questionCount: 0 },
    previousContentSignatures,
  );
  return unit.conceptPages[0];
}

export function unitContentSignatures(unit) {
  const concepts = Array.isArray(unit?.conceptPages)
    ? unit.conceptPages.flatMap((page) => Array.isArray(page?.bodyParagraphs) ? page.bodyParagraphs : [])
    : [];
  const questions = Array.isArray(unit?.questions) ? unit.questions.map((question) => question?.question) : [];
  return [
    ...concepts.map((item) => `concept:${text(item, 700)}`),
    ...questions.map((item) => `question:${text(item, 700)}`),
  ].filter((item) => item.length > 9);
}
