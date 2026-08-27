import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOfficialExamResources } from "../src/lib/officialExamResources.ts";
import { buildCurriculumResourceFeed } from "../src/lib/curriculumResourceFeed.ts";
import {
  ENGLISH_MOCK_EXAM_QUESTION_NUMBERS,
  MOCK_EXAM_VARIANT_TYPES,
  createMockExamPlaceholderSessions,
  formatMockExamSession,
  sortMockExamSessionsNewestFirst,
} from "../src/lib/mockExamNavigation.ts";

test("official exam responses are normalized before rendering", () => {
  assert.deepEqual(normalizeOfficialExamResources([
    {
      id: "2026-grade3-09-english",
      title: "2026년 고3 9월 영어 모의평가",
      year: 2026,
      grade: 3,
      month: 9,
      organizer: "평가원",
      collectedAt: "2026-08-26T00:00:00.000Z",
      files: ["question", "answer", "answer", "unknown"],
    },
  ]), [
    {
      id: "2026-grade3-09-english",
      title: "2026년 고3 9월 영어 모의평가",
      year: 2026,
      grade: 3,
      month: 9,
      organizer: "평가원",
      collectedAt: "2026-08-26T00:00:00.000Z",
      files: ["question", "answer"],
    },
  ]);
});

test("malformed API responses fail without reaching the page renderer", () => {
  assert.throws(
    () => normalizeOfficialExamResources(undefined),
    /응답 형식이 올바르지 않습니다/u,
  );
});

test("entries without downloadable files are omitted", () => {
  assert.deepEqual(normalizeOfficialExamResources([{ id: "empty", files: [] }]), []);
});

test("manual and official resources share one newest-first feed", () => {
  const manualRows = [
    {
      id: "manual-old",
      catalog: "high_school",
      category: "grade1_mock",
      title: "오래된 변형문제",
      description: "",
      files: [],
      authorId: "teacher",
      createdAtMs: Date.parse("2026-08-20T00:00:00.000Z"),
    },
    {
      id: "manual-new",
      catalog: "high_school",
      category: "grade1_mock",
      title: "최신 변형문제",
      description: "",
      files: [],
      authorId: "teacher",
      createdAtMs: Date.parse("2026-08-26T12:00:00.000Z"),
    },
  ];
  const officialRows = [{
    id: "official-middle",
    title: "공식 원문",
    year: 2026,
    grade: 1,
    month: 8,
    organizer: "교육청",
    collectedAt: "2026-08-24T00:00:00.000Z",
    files: ["question"],
  }];

  const feed = buildCurriculumResourceFeed(manualRows, officialRows);
  assert.deepEqual(
    feed.map((item) => item.kind === "manual" ? `manual:${item.row.id}` : `official:${item.exam.id}`),
    ["manual:manual-new", "official:official-middle", "manual:manual-old"],
  );
});

test("mock exam navigation exposes the selectable English question ranges and 17 empty variant slots", () => {
  const expectedQuestionNumbers = [
    ...Array.from({ length: 7 }, (_, index) => index + 18),
    ...Array.from({ length: 17 }, (_, index) => index + 29),
  ];

  assert.equal(ENGLISH_MOCK_EXAM_QUESTION_NUMBERS.length, 24);
  assert.deepEqual(ENGLISH_MOCK_EXAM_QUESTION_NUMBERS, expectedQuestionNumbers);
  assert.equal(ENGLISH_MOCK_EXAM_QUESTION_NUMBERS.includes(17), false);
  assert.equal(ENGLISH_MOCK_EXAM_QUESTION_NUMBERS.includes(25), false);
  assert.equal(ENGLISH_MOCK_EXAM_QUESTION_NUMBERS.includes(28), false);
  assert.equal(MOCK_EXAM_VARIANT_TYPES.length, 17);
  assert.equal(new Set(MOCK_EXAM_VARIANT_TYPES.map((item) => item.id)).size, 17);
});

test("mock exam sessions are displayed from the latest year and month", () => {
  const sessions = sortMockExamSessionsNewestFirst([
    { id: "old", title: "2025년 9월", year: 2025, grade: 1, month: 9, organizer: "교육청", collectedAt: null, files: ["question"] },
    { id: "latest", title: "2026년 6월", year: 2026, grade: 1, month: 6, organizer: "교육청", collectedAt: null, files: ["question"] },
    { id: "middle", title: "2026년 3월", year: 2026, grade: 1, month: 3, organizer: "교육청", collectedAt: null, files: ["question"] },
  ]);

  assert.deepEqual(sessions.map((exam) => exam.id), ["latest", "middle", "old"]);
  assert.equal(formatMockExamSession(sessions[0]), "2026년 06월");
});

test("empty or unavailable storage can still expose the navigation structure", () => {
  const sessions = createMockExamPlaceholderSessions(1, new Date("2026-08-28T00:00:00.000Z"), 5);
  assert.deepEqual(
    sessions.map((exam) => formatMockExamSession(exam)),
    ["2026년 06월", "2026년 03월", "2025년 10월", "2025년 09월", "2025년 06월"],
  );
  assert.equal(sessions.every((exam) => exam.placeholder && exam.files.length === 0), true);
});
