import type { TextbookAnswerKeyStub, TextbookUnitContent } from "@/types/textbookAuto";

/** 문항 id: u{unitIndex}-p-{i} 확인학습, u{unitIndex}-t-{i} 단원평가 */
export function buildAnswerKeyStubs(unitIndex: number, unit: TextbookUnitContent): TextbookAnswerKeyStub[] {
  const out: TextbookAnswerKeyStub[] = [];
  unit.practice.forEach((q, i) => {
    const t = (q ?? "").trim();
    if (t) out.push({ id: `u${unitIndex}-p-${i}`, question: t });
  });
  unit.unitTest.forEach((q, i) => {
    const t = (q ?? "").trim();
    if (t) out.push({ id: `u${unitIndex}-t-${i}`, question: t });
  });
  return out;
}

export function parseStubId(id: string): { unitIndex: number; bucket: "practice" | "unitTest"; orderIndex: number } | null {
  const m = /^u(\d+)-(p|t)-(\d+)$/.exec(id);
  if (!m) return null;
  return {
    unitIndex: Number(m[1]),
    bucket: m[2] === "p" ? "practice" : "unitTest",
    orderIndex: Number(m[3]),
  };
}
