import type { TextbookUnitContent, TextbookUnitTestMcq, TextbookUnitTestShort } from "@/types/textbookAuto";

function validMcq(t: TextbookUnitTestMcq): boolean {
  return t.question.trim().length > 0 && t.choices.filter((c) => c.trim()).length >= 2;
}

function validShort(t: TextbookUnitTestShort): boolean {
  return t.question.trim().length > 0;
}

export function validateDraftUnit(
  unit: TextbookUnitContent,
  opts: { practiceMin: number; unitTestMcq: number; unitTestShort: number },
): string | null {
  const title = unit.unitTitle.trim();
  if (!title || title === "(제목 없음)" || title === "(제목 미정)") {
    return "단원 제목을 입력하세요.";
  }

  if (unit.keyConcepts.length === 0) return "핵심개념을 한 항목 이상 채워 주세요.";

  for (let i = 0; i < unit.keyConcepts.length; i++) {
    const k = unit.keyConcepts[i]!;
    if (!k.concept.trim() || !k.explanation.trim()) {
      return `핵심개념 ${i + 1}항목에 개념과 설명이 모두 필요합니다.`;
    }
  }

  if (unit.contentStudy.length === 0) return "내용학습 블록을 한 개 이상 채워 주세요.";

  for (let i = 0; i < unit.contentStudy.length; i++) {
    const b = unit.contentStudy[i]!;
    if (!b.title.trim()) return `내용학습 ${i + 1}번 제목을 입력하세요.`;
    const bullets = b.bullets.map((s) => s.trim()).filter(Boolean);
    if (bullets.length === 0) return `내용학습 「${b.title}」에 설명 불릿을 한 개 이상 넣으세요.`;
  }

  const practice = unit.practice.map((s) => s.trim()).filter(Boolean);
  if (practice.length < opts.practiceMin) {
    return `확인학습 주관식 문항은 최소 ${opts.practiceMin}개입니다. (현재 ${practice.length}개)`;
  }

  const mcqNeeded = opts.unitTestMcq;
  const shortNeeded = opts.unitTestShort;

  const mcqItems = unit.unitTest.filter((t): t is TextbookUnitTestMcq => t.kind === "mcq" && validMcq(t));
  const shortItems = unit.unitTest.filter((t): t is TextbookUnitTestShort => t.kind === "short" && validShort(t));

  if (mcqItems.length < mcqNeeded) {
    return `단원평가 객관식은 최소 ${mcqNeeded}문항입니다. (유효 ${mcqItems.length}개 — 질문·보기를 채우세요)`;
  }
  if (shortItems.length < shortNeeded) {
    return `단원평가 주관식 단답은 최소 ${shortNeeded}문항입니다. (유효 ${shortItems.length}개)`;
  }

  return null;
}
