import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOfficialExamResources } from "../src/lib/officialExamResources.ts";
import { buildCurriculumResourceFeed } from "../src/lib/curriculumResourceFeed.ts";

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
