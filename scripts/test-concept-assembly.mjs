import assert from "node:assert/strict";
import test from "node:test";
import { QUESTION_BATCH_MAX } from "../api/_lib/csat-question-engine/build-batch-plan.mjs";
import { allowedConceptContent, FirestoreConceptRepository } from "../api/_lib/concept-assembly/concept-repository.mjs";
import { deduplicateConceptBlocks } from "../api/_lib/concept-assembly/deduplicate-concept-blocks.mjs";
import { resolveConceptKeys } from "../api/_lib/concept-assembly/resolve-concept-keys.mjs";
import { runConceptAssemblyPipeline } from "../api/_lib/concept-assembly/run-concept-assembly-pipeline.mjs";
import { selectLatestConceptRecord } from "../api/_lib/concept-assembly/select-latest-concept-record.mjs";
import { sortConceptBlocks } from "../api/_lib/concept-assembly/sort-concept-blocks.mjs";
import { conceptContentHash, validateConceptIntegrity } from "../api/_lib/concept-assembly/validate-concept-integrity.mjs";
import { attachConceptsToQuestions } from "../src/lib/conceptAssembly/attachConceptsToQuestions.ts";
import { buildConceptRenderUnits, splitConceptContentForRender } from "../src/lib/conceptAssembly/buildConceptRenderUnits.ts";
import { CSAT_TEMPLATE_IDS } from "../src/lib/renderEngine/templateIds.ts";

function record(conceptKey, overrides = {}) {
  return {
    recordId: `${conceptKey}-${overrides.publicationYear || 2027}-${overrides.recordSuffix || "a"}`,
    conceptKey,
    title: `${conceptKey} 원문 개념`,
    content: `원문 ${conceptKey} 내용입니다.\n문장과 줄바꿈을 그대로 보존합니다.`,
    excerptContent: "",
    subject: "English",
    targetGrades: [],
    questionTypes: [],
    sourceType: "SUNEUNG_SPECIAL",
    sourceTitle: `${overrides.publicationYear || 2027} 수능특강 영어`,
    publicationYear: overrides.publicationYear || 2027,
    edition: "1판",
    curriculumVersion: "2022 개정",
    unit: undefined,
    chapter: undefined,
    section: undefined,
    page: 10,
    sequence: overrides.sequence,
    updatedAt: overrides.updatedAt || "2027-01-01T00:00:00.000Z",
    rightsStatus: "licensed",
    allowedUse: "verbatim",
    sourceAccessPolicy: "licensed-user-output",
    copyrightPolicy: "licensed-verbatim-use",
    active: true,
    ...overrides,
  };
}

function repository(records) {
  return {
    calls: 0,
    async search() {
      this.calls += 1;
      return records;
    },
  };
}

function mockQuestion(index) {
  return Object.freeze({ id: `q-${index}`, sequence: index, answer: (index % 5) + 1 });
}

test("TEST 1: 같은 conceptKey에서는 최신 2027 원문을 선택한다", () => {
  const selected = selectLatestConceptRecord([
    record("blank_strategy", { publicationYear: 2025 }),
    record("blank_strategy", { publicationYear: 2027 }),
    record("blank_strategy", { publicationYear: 2026 }),
  ]);
  assert.equal(selected?.publicationYear, 2027);
});

test("Firestore adapter는 concept_records의 명시적 원문 필드를 그대로 읽는다", async () => {
  const source = record("purpose_identification");
  const directSnapshot = {
    docs: [{ id: source.recordId, data: () => source }],
  };
  const emptySnapshot = { docs: [] };
  const firestore = {
    collection(name) {
      return {
        where() {
          return { get: async () => name === "concept_records" ? directSnapshot : emptySnapshot };
        },
        limit() {
          return { get: async () => name === "concept_records" ? directSnapshot : emptySnapshot };
        },
      };
    },
  };
  const adapter = new FirestoreConceptRepository(firestore);
  const records = await adapter.search({
    conceptKeys: ["purpose_identification"],
    subject: "English",
    targetGrade: "고3",
    questionTypes: ["PURPOSE"],
  });
  assert.equal(records.length, 1);
  assert.equal(records[0]?.content, source.content);
  assert.equal(records[0]?.allowedUse, "verbatim");
});

test("TEST 2: 여러 문제 유형의 conceptKey를 registry 순서로 합치고 중복을 제거한다", () => {
  assert.deepEqual(resolveConceptKeys(["BLANK_SHORT", "BLANK_LONG"]), [
    "blank_strategy",
    "contextual_inference",
    "logical_relation",
    "main_argument_detection",
  ]);
  const blocks = [
    { recordId: "a", conceptKey: "contextual_inference", contentHash: "h1" },
    { recordId: "b", conceptKey: "contextual_inference", contentHash: "h2" },
    { recordId: "c", conceptKey: "logical_relation", contentHash: "h1" },
    { recordId: "d", conceptKey: "logical_relation", contentHash: "h3" },
  ];
  assert.deepEqual(deduplicateConceptBlocks(blocks).map((block) => block.recordId), ["a", "d"]);
});

test("TEST 3: 원문은 조회부터 조립 후까지 바뀌지 않고 SHA-256이 일치한다", async () => {
  const original = "첫 줄은 그대로입니다.\n\n  들여쓰기와 공백도 그대로입니다.  ";
  const source = record("purpose_identification", { content: original });
  const result = await runConceptAssemblyPipeline({
    repository: repository([source]),
    questionTypes: ["PURPOSE"],
  });
  assert.equal(result.status, "ready");
  assert.equal(result.section.blocks[0]?.content, original);
  assert.equal(result.section.blocks[0]?.contentHash, conceptContentHash(original));
  assert.equal(validateConceptIntegrity(result.section.blocks[0]), true);
  assert.equal(splitConceptContentForRender(original).join(""), original);
});

test("TEST 4: 일부 Concept이 없으면 partial이며 AI 보충 없이 확보된 원문만 출력한다", async () => {
  const repo = repository([
    record("blank_strategy"),
    record("contextual_inference"),
  ]);
  const result = await runConceptAssemblyPipeline({
    repository: repo,
    questionTypes: ["BLANK_LONG"],
  });
  assert.equal(repo.calls, 1);
  assert.equal(result.status, "partial");
  assert.equal(result.section.blocks.length, 2);
  assert.deepEqual(result.missingConceptKeys, ["logical_relation", "main_argument_detection"]);
});

test("권한 없는 수능특강 원본은 master 계정에서도 verbatim 출력하지 않는다", () => {
  const restricted = record("blank_strategy", {
    allowedUse: "unspecified",
    rightsStatus: "",
    sourceAccessPolicy: "system-reference-only",
    copyrightPolicy: "derived-structure-only-no-source-republication",
  });
  assert.equal(allowedConceptContent(restricted, { isSuperAdmin: true }), null);
});

test("DB sequence가 우선이고 그 다음 registry 순서로 안정 정렬한다", () => {
  const blocks = [
    { recordId: "b", conceptKey: "contextual_inference", sequence: 2, source: {} },
    { recordId: "a", conceptKey: "blank_strategy", sequence: 1, source: {} },
    { recordId: "d", conceptKey: "main_argument_detection", source: {} },
    { recordId: "c", conceptKey: "logical_relation", source: {} },
  ];
  assert.deepEqual(
    sortConceptBlocks(blocks, ["blank_strategy", "contextual_inference", "logical_relation", "main_argument_detection"])
      .map((block) => block.recordId),
    ["a", "b", "c", "d"],
  );
});

test("TEST 6: Concept 3개 뒤에 기존 40문항을 동일 참조·동일 순서로 붙인다", () => {
  const questions = Array.from({ length: 40 }, (_, index) => mockQuestion(index + 1));
  const section = {
    type: "concept",
    blocks: [1, 2, 3].map((index) => ({ recordId: `c-${index}` })),
    metadata: {},
  };
  const result = attachConceptsToQuestions(section, questions);
  assert.equal(result.sections[0], section);
  assert.equal(result.sections[1]?.type, "questions");
  assert.equal(result.sections[1]?.questions, questions);
  assert.deepEqual(result.sections[1]?.questions.map((question) => question.id), questions.map((question) => question.id));
});

test("TEST 7: Concept 5개와 기존 50문항을 붙여도 문제를 재호출하거나 변경하지 않는다", () => {
  const questions = Array.from({ length: 50 }, (_, index) => mockQuestion(index + 1));
  const original = [...questions];
  const section = {
    type: "concept",
    blocks: Array.from({ length: 5 }, (_, index) => ({ recordId: `c-${index + 1}` })),
    metadata: {},
  };
  const result = attachConceptsToQuestions(section, questions);
  assert.equal(result.sections.length, 2);
  assert.deepEqual(questions, original);
  assert.equal(result.sections[1]?.questions.length, 50);
});

test("TEST 8: 6개 Template 변경은 같은 Concept/Question 데이터를 사용하고 렌더 단위만 다시 만든다", () => {
  const content = "템플릿을 바꿔도 유지되는 DB 원문입니다.";
  const block = {
    recordId: "concept-1",
    conceptKey: "main_idea_detection",
    title: "요지 파악",
    content,
    contentHash: conceptContentHash(content),
    integrity: "verified",
    allowedUse: "verbatim",
    source: { sourceType: "INTERNAL", sourceTitle: "내부 승인 자료", publicationYear: 2027 },
  };
  const section = { type: "concept", blocks: [block], metadata: { conceptCount: 1, missingConceptKeys: [], sourceTitles: ["내부 승인 자료"], sourceYears: [2027] } };
  const questions = Array.from({ length: 40 }, (_, index) => mockQuestion(index + 1));
  const original = JSON.stringify({ section, questions });
  CSAT_TEMPLATE_IDS.forEach(() => {
    assert.equal(buildConceptRenderUnits(section).map((unit) => unit.content).join(""), content);
    assert.equal(attachConceptsToQuestions(section, questions).sections[1]?.questions, questions);
  });
  assert.equal(JSON.stringify({ section, questions }), original);
});

test("Question Engine은 안정성을 위해 1문항씩 생성한다", () => {
  assert.equal(QUESTION_BATCH_MAX, 1);
});
