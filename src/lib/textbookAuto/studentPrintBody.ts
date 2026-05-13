import type { TextbookAnswerKeyItem, TextbookAnswerKeyLayout, TextbookUnitContent, TextbookUnitTestItem } from "@/types/textbookAuto";
import { unitForStudentOutput } from "@/lib/textbookAuto/sectionInclusion";
import { practiceItemQuestion } from "@/lib/textbookAuto/practiceItems";
import { stubQuestionLineForUnitTest } from "@/lib/textbookAuto/buildAnswerKeyStubs";

function stripTestItem(it: TextbookUnitTestItem): TextbookUnitTestItem {
  if (it.kind === "mcq") {
    return { kind: "mcq", question: it.question, choices: it.choices };
  }
  return { kind: "short", question: it.question };
}

function mergeUnitForInlineKeys(unit: TextbookUnitContent, unitIndex: number, keys: TextbookAnswerKeyItem[]): TextbookUnitContent {
  if (!keys.length) return unit;
  const pRows = keys
    .filter((k) => k.unitIndex === unitIndex && k.bucket === "practice")
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const tRows = keys
    .filter((k) => k.unitIndex === unitIndex && k.bucket === "unitTest")
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const practice = unit.practice.map((p, i) => {
    const row = pRows[i];
    if (!row) return p;
    const answer = row.answer.trim() && row.answer !== "—" ? row.answer : p.answer;
    const explanationBullets =
      row.explanationBullets.filter((s) => s.trim()).length > 0 ? row.explanationBullets : p.explanationBullets;
    return { ...p, ...(answer ? { answer } : {}), ...(explanationBullets?.length ? { explanationBullets } : {}) };
  });
  let ti = 0;
  const unitTest = unit.unitTest.map((it) => {
    const line = stubQuestionLineForUnitTest(it);
    if (!line) return it;
    const row = tRows[ti];
    ti++;
    if (!row) return it;
    const answer = row.answer.trim() && row.answer !== "—" ? row.answer : it.answer;
    const explanationBullets =
      row.explanationBullets.filter((s) => s.trim()).length > 0 ? row.explanationBullets : it.explanationBullets;
    return { ...it, ...(answer ? { answer } : {}), ...(explanationBullets?.length ? { explanationBullets } : {}) };
  });
  return { ...unit, practice, unitTest };
}

/** 말미 부록 모드: 본문에서는 문항(발문·보기)만 두고 정답·해설은 숨깁니다. */
export function unitForStudentPrintBody(
  unit: TextbookUnitContent,
  layout: TextbookAnswerKeyLayout,
  opts?: { unitIndex?: number; answerKeyItems?: TextbookAnswerKeyItem[] },
): TextbookUnitContent {
  const base = unitForStudentOutput(unit);
  if (layout === "inline") {
    const ui = opts?.unitIndex;
    const keys = opts?.answerKeyItems ?? [];
    if (ui !== undefined && keys.length) return mergeUnitForInlineKeys(base, ui, keys);
    return base;
  }
  return {
    ...base,
    practice: base.practice.map((p) => ({ question: practiceItemQuestion(p) })),
    unitTest: base.unitTest.map(stripTestItem),
  };
}
