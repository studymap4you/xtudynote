import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  buildQuestionBank54473Record,
  QUESTION_BANK_54473_DATASET_ID,
  questionBank54473DocumentId,
} from "./lib/question-bank-54473.mjs";

const sourceText = [
  "Students improve their reading when they examine how ideas connect across a passage.",
  "A clear topic sentence gives them a useful starting point for that analysis.",
  "Supporting details then explain why the writer selected a particular example.",
  "Careful readers compare those details instead of choosing an answer from one familiar word.",
  "They also check whether a choice expands or reduces the scope of the original claim.",
  "This process prevents attractive distractors from replacing the writer's actual conclusion.",
  "Regular practice makes the evidence easier to locate during a timed examination.",
  "As a result, students can select answers more accurately and explain their reasoning clearly.",
].join(" ");
const sourceHash = createHash("sha256").update(sourceText).digest("hex");
const source = {
  passage_id: "TEST-PASSAGE-001",
  grade: "고2",
  text: sourceText,
  text_sha256: sourceHash,
  keywords: ["reading", "evidence", "reasoning"],
};

function fixture(overrides = {}) {
  const raw = {
    question_id: "TEST-PASSAGE-001::11_WORD_BLANK",
    passage_id: source.passage_id,
    grade: "고2",
    type_code: "11_WORD_BLANK",
    type: "빈칸 추론 - 단어형",
    prompt: "원문의 빈칸에 들어갈 단어로 가장 적절한 것을 고르시오.",
    problem_display: "Regular practice makes the evidence easier to locate during a timed __________.",
    options: ["teacher", "lesson", "examination", "example", "method"],
    answer: "examination",
    answer_number: 3,
    explanation: "빈칸은 원문 단어를 가린 것이다.",
    source_text_sha256: sourceHash,
    generation_method: "deterministic extractive transformation",
    ...overrides,
  };
  const answerRow = {
    question_id: raw.question_id,
    passage_id: raw.passage_id,
    answer_number: raw.answer_number == null ? "" : String(raw.answer_number),
    answer: raw.answer,
    source_text_sha256: raw.source_text_sha256,
  };
  const indexRow = {
    question_id: raw.question_id,
    passage_id: raw.passage_id,
    type_code: raw.type_code,
    source_text_sha256: raw.source_text_sha256,
  };
  return { raw, answerRow, indexRow };
}

test("verified archive question is corrected and approved for exact exam reuse", () => {
  const values = fixture();
  const record = buildQuestionBank54473Record({ ...values, source });
  assert.equal(record.datasetId, QUESTION_BANK_54473_DATASET_ID);
  assert.equal(record.questionType, "blank_short");
  assert.equal(record.canonicalQuestionType, "BLANK_SHORT");
  assert.equal(record.status, "approved");
  assert.equal(record.policyStatus, "approved");
  assert.equal(record.validation.valid, true);
  assert.deepEqual(record.reusePolicy, ["textbook-structure-reference", "exam-exact"]);
  assert.equal((record.passage.match(/________/gu) || []).length, 1);
  assert.equal(record.choices.length, 5);
  assert.equal(record.choices[record.answer - 1], record.transformation.removedText);
});

test("integrity mismatch preserves the record but quarantines it from generation", () => {
  const values = fixture({ source_text_sha256: "0".repeat(64) });
  const record = buildQuestionBank54473Record({ ...values, source });
  assert.equal(record.status, "needs_review");
  assert.equal(record.policyStatus, "needs_review");
  assert.equal(record.qualityScore, 0);
  assert.ok(record.validation.issues.includes("questionSourceHashMatches"));
});

test("problem document id is deterministic and Firestore-safe", () => {
  const first = questionBank54473DocumentId("TEST-PASSAGE-001::11_WORD_BLANK");
  const second = questionBank54473DocumentId("TEST-PASSAGE-001::11_WORD_BLANK");
  assert.equal(first, second);
  assert.match(first, /^problem_[a-f0-9]{32}$/u);
});
