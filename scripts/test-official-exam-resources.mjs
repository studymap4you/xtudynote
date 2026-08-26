import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOfficialExamResources } from "../src/lib/officialExamResources.ts";

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
