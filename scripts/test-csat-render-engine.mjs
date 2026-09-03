import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeCSATQuestions } from "../src/lib/renderEngine/normalizeQuestions.ts";
import { buildCSATExplanationUnits, paginateMeasuredCSATExplanationUnits } from "../src/lib/renderEngine/paginateExplanationUnits.ts";
import { buildCSATRenderUnits, paginateMeasuredCSATUnits } from "../src/lib/renderEngine/paginateQuestionUnits.ts";
import { canRenderCSATReviewContent, resolveCSATRenderOptions } from "../src/lib/renderEngine/renderOptions.ts";
import { CSAT_TEMPLATE_IDS, DEFAULT_CSAT_TEMPLATE_ID } from "../src/lib/renderEngine/templateIds.ts";
import { CSAT_TEMPLATE_TOKENS } from "../src/lib/renderEngine/templates/templateTokens.ts";
import { CSAT_TEMPLATE_STORAGE_KEY, getSavedCSATTemplateId, saveCSATTemplateId } from "../src/lib/renderEngine/templateStorage.ts";
import { cleanImportedQuestionText, stripLegacyInlineEmphasis } from "../src/lib/renderEngine/questionText.ts";

function mockQuestion(index, overrides = {}) {
  const words = Array.from({ length: 115 }, (_, wordIndex) => `reading${index}_${wordIndex}`);
  return {
    id: `question-${index}`,
    sequence: index,
    questionType: "MAIN_IDEA",
    difficulty: "medium",
    scoreSuggestion: index % 4 === 0 ? 3 : 2,
    sourceId: `source-${index}`,
    referenceQuestionIds: [`reference-${index}`],
    passage: `${words.slice(0, 55).join(" ")}. ${words.slice(55).join(" ")}.`,
    stem: "다음 글의 요지로 가장 적절한 것은?",
    choices: Array.from({ length: 5 }, (_, choiceIndex) => ({
      index: choiceIndex + 1,
      text: `Choice ${choiceIndex + 1} for question ${index} preserves a plausible relationship to the passage.`,
      isCorrect: choiceIndex === 2,
      distractorPattern: choiceIndex === 2 ? undefined : ["PARTIAL_TRUTH", "SCOPE_SHIFT", "CAUSAL_DISTORTION", "POLARITY_REVERSAL"][choiceIndex],
      rationale: "문맥상 범위 또는 논리 방향이 다르다.",
    })),
    answer: 3,
    explanation: "글 전체의 논리와 범위를 함께 반영한 선택지이다.",
    evidence: { reasoning: "도입과 결론의 핵심 개념을 연결한다." },
    semanticFingerprint: `fingerprint-${index}`,
    qualityMetadata: { batchId: `batch-${Math.ceil(index / 5)}`, generationAttempt: 1 },
    ...overrides,
  };
}

function assertOrderAndPagination(count) {
  const source = Array.from({ length: count }, (_, index) => mockQuestion(index + 1));
  const normalized = normalizeCSATQuestions(source);
  assert.equal(normalized.issues.length, 0);
  assert.equal(normalized.questions.length, count);
  assert.deepEqual(normalized.questions.map((question) => question.studentNumber), Array.from({ length: count }, (_, index) => index + 1));
  const units = buildCSATRenderUnits(normalized.questions);
  const heights = new Map(units.map((unit, index) => [unit.id, 300 + (index % 3) * 70]));
  const pages = paginateMeasuredCSATUnits(units, heights, 900, 28);
  const renderedUnits = pages.flatMap((page) => page.units);
  assert.deepEqual(renderedUnits.map((unit) => unit.id), units.map((unit) => unit.id));
  assert.equal(new Set(renderedUnits.map((unit) => unit.id)).size, units.length);
  assert.ok(pages.every((page) => page.units.length >= 1));
  assert.ok(pages.every((page) => new Set(
    page.units.filter((unit) => unit.kind === "question").map((unit) => unit.question.id),
  ).size <= 1));
}

function paginateForTemplate(source, templateId) {
  const normalized = normalizeCSATQuestions(source);
  const units = buildCSATRenderUnits(normalized.questions);
  const metrics = CSAT_TEMPLATE_TOKENS[templateId].pagination;
  const heights = new Map(units.map((unit, index) => [unit.id, (300 + (index % 3) * 70) * metrics.estimatedUnitScale]));
  const pages = paginateMeasuredCSATUnits(units, heights, metrics.estimatedCapacity, metrics.estimatedGap);
  return { normalized, units, pages, renderedUnits: pages.flatMap((page) => page.units) };
}

function assertAllTemplatesPreserveQuestions(count) {
  const source = Array.from({ length: count }, (_, index) => mockQuestion(index + 1));
  const original = structuredClone(source);
  const baselineAnswers = source.map((question) => question.answer);
  const baselineIds = source.map((question) => question.id);
  const pageCounts = [];

  CSAT_TEMPLATE_IDS.forEach((templateId) => {
    const rendered = paginateForTemplate(source, templateId);
    assert.equal(rendered.normalized.issues.length, 0, `${templateId}: normalization issues`);
    assert.equal(rendered.normalized.questions.length, count, `${templateId}: question count`);
    assert.deepEqual(rendered.normalized.questions.map((question) => question.id), baselineIds, `${templateId}: order`);
    assert.deepEqual(rendered.normalized.questions.map((question) => question.answer), baselineAnswers, `${templateId}: answers`);
    assert.deepEqual(rendered.renderedUnits.map((unit) => unit.id), rendered.units.map((unit) => unit.id), `${templateId}: units`);
    assert.equal(new Set(rendered.renderedUnits.map((unit) => unit.id)).size, rendered.units.length, `${templateId}: duplicate units`);
    assert.ok(rendered.pages.length > 0, `${templateId}: pages`);
    assert.ok(rendered.pages.every((page) => new Set(
      page.units.filter((unit) => unit.kind === "question").map((unit) => unit.question.id),
    ).size <= 1), `${templateId}: more than one question on a page`);
    pageCounts.push(rendered.pages.length);
  });

  assert.deepEqual(source, original, "template rendering must not mutate generated question JSON");
  assert.ok(pageCounts.every((pageCount) => pageCount >= count), "every question needs its own page boundary");
}

test("TEST 1: 10문항을 순서와 번호 손실 없이 페이지로 구성한다", () => {
  assertOrderAndPagination(10);
});

test("TEST 2: 40문항 전체를 한 번에 정규화하고 누락 없이 페이지로 구성한다", () => {
  assertOrderAndPagination(40);
});

test("TEST 3: 50문항 전체를 한 번에 정규화하고 누락 없이 페이지로 구성한다", () => {
  assertOrderAndPagination(50);
});

test("TEST 4: 매우 긴 BLANK_LONG 지문과 선택지를 안전한 표시 단위로 나눈다", () => {
  const longPassage = Array.from({ length: 1_000 }, (_, index) => `longword${index}`).join(" ");
  const longChoices = Array.from({ length: 5 }, (_, index) => ({
    index: index + 1,
    text: Array.from({ length: 85 }, (_, wordIndex) => `choice${index}_${wordIndex}`).join(" "),
    isCorrect: index === 1,
    distractorPattern: index === 1 ? undefined : "SCOPE_SHIFT",
    rationale: "범위를 바꾸었다.",
  }));
  const normalized = normalizeCSATQuestions([mockQuestion(1, { questionType: "BLANK_LONG", passage: longPassage, choices: longChoices, answer: 2 })]);
  const units = buildCSATRenderUnits(normalized.questions);
  assert.ok(units.length > 5);
  assert.ok(units.filter((unit) => unit.kind === "question" && unit.passage).every((unit) => unit.kind === "question" && unit.passage.length <= 1_000));
  assert.equal(units.filter((unit) => unit.kind === "question").at(-1)?.showReview, true);
});

test("TEST 5: LONG_READING 그룹은 공통 지문을 한 번만 만들고 하위 문항을 유지한다", () => {
  const sharedPassage = Array.from({ length: 210 }, (_, index) => `shared${index}`).join(" ");
  const normalized = normalizeCSATQuestions([
    mockQuestion(41, { questionType: "LONG_READING_1", groupId: "long-41-42", sharedPassage }),
    mockQuestion(42, { questionType: "LONG_READING_2", groupId: "long-41-42", sharedPassage }),
  ]);
  const units = buildCSATRenderUnits(normalized.questions);
  const sharedUnits = units.filter((unit) => unit.kind === "shared-passage");
  const questionUnits = units.filter((unit) => unit.kind === "question");
  assert.ok(sharedUnits.length >= 1);
  assert.equal(questionUnits.filter((unit) => unit.showQuestionHeader).length, 2);
  assert.ok(questionUnits.every((unit) => !unit.passage));
  assert.equal(sharedUnits[0]?.startNumber, 1);
  assert.equal(sharedUnits[0]?.endNumber, 2);
});

test("짧은 문항 10개는 정확히 한 문항씩 10페이지에 배치한다", () => {
  const source = Array.from({ length: 10 }, (_, index) => mockQuestion(index + 1, {
    passage: `Short passage for question ${index + 1}.`,
    choices: Array.from({ length: 5 }, (_, choiceIndex) => ({
      index: choiceIndex + 1,
      text: `Short choice ${choiceIndex + 1}.`,
      isCorrect: choiceIndex === 2,
      distractorPattern: choiceIndex === 2 ? undefined : "SCOPE_SHIFT",
      rationale: "범위가 다르다.",
    })),
  }));
  const normalized = normalizeCSATQuestions(source);
  const units = buildCSATRenderUnits(normalized.questions);
  const heights = new Map(units.map((unit) => [unit.id, 240]));
  const pages = paginateMeasuredCSATUnits(units, heights, 900, 28);
  assert.equal(pages.length, 10);
  assert.ok(pages.every((page) => page.units.filter((unit) => unit.kind === "question").length === 1));
});

test("40·50문항의 정답과 해설은 별도 페이지 단위로 순서와 개수를 유지한다", () => {
  [40, 50].forEach((count) => {
    const normalized = normalizeCSATQuestions(Array.from({ length: count }, (_, index) => mockQuestion(index + 1)));
    const units = buildCSATExplanationUnits(normalized.questions);
    const heights = new Map(units.map((unit, index) => [unit.id, 170 + (index % 3) * 30]));
    const pages = paginateMeasuredCSATExplanationUnits(units, heights, 900, 28);
    const rendered = pages.flatMap((page) => page.units);
    assert.equal(rendered.length, count);
    assert.deepEqual(rendered.map((unit) => unit.question.id), normalized.questions.map((question) => question.id));
    assert.deepEqual(rendered.map((unit) => unit.question.explanation), normalized.questions.map((question) => question.explanation));
  });
});

test("문제 페이지는 해설을 출력하지 않고 해설지는 문제 뒤에 렌더링한다", async () => {
  const questionBlock = await readFile(new URL("../src/components/renderEngine/CSATQuestionBlock.tsx", import.meta.url), "utf8");
  const bookletTemplate = await readFile(new URL("../src/components/renderEngine/templates/CSATTemplateBooklet.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(questionBlock, />\s*\{question\.explanation\}\s*</);
  assert.match(bookletTemplate, /\{pages\.map[\s\S]+<AnswerKeyPage[\s\S]+explanationPages\.map/);
});

test("malformed 문항은 임의 보강 없이 제외하고 오류로 보고한다", () => {
  const invalid = mockQuestion(1, { passage: "", choices: [] });
  const result = normalizeCSATQuestions([invalid]);
  assert.equal(result.questions.length, 0);
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0]?.message || "", /passage|five-valid-choices/);
});

test("가져온 PDF 꼬리 문구와 의도하지 않은 굵은 글씨를 최종 출력에서 제거한다", () => {
  const trailer = "Choice five. Xtudy Universe | 고1 2026년 6월 11유형 변형문제 28 2026년 6월 고1 19번 정답 및 해설";
  assert.equal(cleanImportedQuestionText(trailer), "Choice five.");
  assert.equal(stripLegacyInlineEmphasis("Normal **unexpected bold** and <b>legacy 𝐛𝐨𝐥𝐝</b>."), "Normal unexpected bold and legacy bold.");
});

test("무작위 30문항을 반복 구성해도 문항·선지와 정리된 출력 텍스트를 보존한다", () => {
  const pool = Array.from({ length: 60 }, (_, index) => mockQuestion(index + 1, {
    passage: `Passage ${index + 1} with ① 𝐤𝐞𝐲 evidence and enough context for rendering.`,
    choices: Array.from({ length: 5 }, (_, choiceIndex) => ({
      index: choiceIndex + 1,
      text: `Choice ${choiceIndex + 1} for question ${index + 1}.${choiceIndex === 4 ? ` Xtudy Universe | 고${index % 2 + 1} 2026년 6월 11유형 변형문제 ${index + 2} 정답 및 해설` : ""}`,
      isCorrect: choiceIndex === 2,
      distractorPattern: choiceIndex === 2 ? undefined : "SCOPE_SHIFT",
      rationale: "범위가 다르다.",
    })),
  }));

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const selected = [...pool].sort(() => Math.random() - 0.5).slice(0, 30);
    const normalized = normalizeCSATQuestions(selected);
    assert.equal(normalized.issues.length, 0);
    assert.equal(normalized.questions.length, 30);
    assert.equal(new Set(normalized.questions.map((question) => question.id)).size, 30);
    normalized.questions.forEach((question) => {
      assert.equal(question.choices.length, 5);
      const outputText = [question.passage, question.stem, ...question.choices.map((choice) => choice.text)].join(" ");
      assert.doesNotMatch(outputText, /Xtudy[\s-]*Universe|11유형\s+변형문제/iu);
      assert.doesNotMatch(stripLegacyInlineEmphasis(outputText), /[\u{1D400}-\u{1D7FF}]/u);
    });
  }
});

test("student mode는 잘못 전달된 정답표 옵션도 강제로 차단한다", () => {
  const options = resolveCSATRenderOptions({ mode: "student", showAnswerKey: true });
  assert.equal(options.mode, "student");
  assert.equal(options.showAnswerKey, false);
  assert.equal(canRenderCSATReviewContent(options), false);
});

test("시험지는 review mode에서 문제 뒤 정답표와 상세 해설을 활성화한다", () => {
  const options = resolveCSATRenderOptions({
    mode: "review",
    showAnswerKey: true,
    showStudyChecklist: false,
    showMotivationalCopy: false,
  });
  assert.equal(options.mode, "review");
  assert.equal(options.showAnswerKey, true);
  assert.equal(options.showStudyChecklist, false);
  assert.equal(options.showMotivationalCopy, false);
  assert.equal(canRenderCSATReviewContent(options), true);
});

test("40문항을 6개 공식 템플릿으로 바꿔도 내용·정답·순서를 유지하고 pagination만 재계산한다", () => {
  assert.equal(CSAT_TEMPLATE_IDS.length, 6);
  assertAllTemplatesPreserveQuestions(40);
});

test("50문항을 6개 공식 템플릿으로 바꿔도 누락 없이 A4 페이지 묶음을 만든다", () => {
  assertAllTemplatesPreserveQuestions(50);
});

test("Editorial Magazine의 긴 BLANK_LONG도 단일 열 표시 단위와 순서를 유지한다", () => {
  const longPassage = Array.from({ length: 1_200 }, (_, index) => `editorial${index}`).join(" ");
  const rendered = paginateForTemplate([
    mockQuestion(1, { questionType: "BLANK_LONG", passage: longPassage }),
  ], "xuniverse-csat-editorial-magazine-v1");
  assert.ok(rendered.units.length > 2);
  assert.deepEqual(rendered.renderedUnits.map((unit) => unit.id), rendered.units.map((unit) => unit.id));
});

test("Notebook Grid는 명시된 경우에만 학습 체크리스트 옵션을 활성화한다", async () => {
  const enabled = resolveCSATRenderOptions({ showStudyChecklist: true });
  const disabled = resolveCSATRenderOptions({ showStudyChecklist: false });
  assert.equal(enabled.showStudyChecklist, true);
  assert.equal(disabled.showStudyChecklist, false);
  const css = await readFile(new URL("../src/components/renderEngine/csatRender.module.css", import.meta.url), "utf8");
  assert.match(css, /xuniverse-csat-notebook-grid-v1[^}]+\.studyChecklist/s);
});

test("마지막 템플릿을 저장·복원하고 invalid 값은 Studygram으로 fallback한다", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  saveCSATTemplateId("xuniverse-csat-editorial-magazine-v1", storage);
  assert.equal(values.get(CSAT_TEMPLATE_STORAGE_KEY), "xuniverse-csat-editorial-magazine-v1");
  assert.equal(getSavedCSATTemplateId(storage), "xuniverse-csat-editorial-magazine-v1");
  values.set(CSAT_TEMPLATE_STORAGE_KEY, "deleted-template-v9");
  assert.equal(getSavedCSATTemplateId(storage), DEFAULT_CSAT_TEMPLATE_ID);
});

test("인쇄 스타일은 A4 portrait와 student booklet page break를 유지한다", async () => {
  const css = await readFile(new URL("../src/styles/csat-print.css", import.meta.url), "utf8");
  assert.match(css, /size:\s*A4 portrait/);
  assert.match(css, /width:\s*210mm/);
  assert.match(css, /height:\s*297mm/);
  assert.match(css, /page-break-after:\s*always/);
});
