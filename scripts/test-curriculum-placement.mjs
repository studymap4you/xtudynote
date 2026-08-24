import assert from "node:assert/strict";
import test from "node:test";
import { inferCurriculumPlacements, textbookSourceIdToCategory } from "../src/lib/curriculumPlacement.ts";

test("CSAT papers are placed in the supplementary CSAT entry and their school year", () => {
  assert.deepEqual(
    inferCurriculumPlacements({
      subject: "2025학년도 대학수학능력시험 영어 영역",
      identifier: "csat-english-2025",
      libraryCategory: "problem_bank",
    }),
    [
      { catalog: "high_school", category: "high_school_csat" },
      { catalog: "csat", category: "csat_2025" },
    ],
  );
});

test("EBS books are placed in the requested supplementary textbook categories", () => {
  assert.deepEqual(
    inferCurriculumPlacements({ subject: "2027년 수능특강 영어", libraryCategory: "problem_bank" }),
    [{ catalog: "high_school", category: "ebs_special_lecture" }],
  );
  assert.deepEqual(
    inferCurriculumPlacements({ subject: "2026 수능완성 영어", libraryCategory: "problem_bank" }),
    [{ catalog: "high_school", category: "ebs_complete" }],
  );
  assert.deepEqual(
    inferCurriculumPlacements({ subject: "올림포스 영어 독해", libraryCategory: "problem_bank" }),
    [{ catalog: "high_school", category: "olympos" }],
  );
});

test("source materials remain exclusive to the source-material library", () => {
  assert.deepEqual(
    inferCurriculumPlacements({ subject: "Open access paper", libraryCategory: "source_material" }),
    [],
  );
});

test("problem-bank textbook identifiers map to their publisher category", () => {
  assert.equal(
    textbookSourceIdToCategory("common-english-1-ne-minbyeongcheon"),
    "textbook_common1_ne_minbyeongcheon",
  );
  assert.deepEqual(
    inferCurriculumPlacements({
      identifier: "common-english-1-ne-minbyeongcheon",
      libraryCategory: "problem_bank",
    }),
    [{ catalog: "supplementary", category: "textbook_common1_ne_minbyeongcheon" }],
  );
});

test("explicit multi-menu placements override title inference", () => {
  assert.deepEqual(
    inferCurriculumPlacements({
      subject: "수능특강",
      resourcePlacements: [
        { catalog: "high_school", category: "ebs_special_lecture" },
        { catalog: "csat", category: "csat_archive" },
      ],
    }),
    [
      { catalog: "high_school", category: "ebs_special_lecture" },
      { catalog: "csat", category: "csat_archive" },
    ],
  );
});
