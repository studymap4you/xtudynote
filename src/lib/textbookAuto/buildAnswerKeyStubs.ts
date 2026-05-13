import type { TextbookAnswerKeyStub, TextbookUnitContent, TextbookUnitTestItem } from "@/types/textbookAuto";
import { practiceItemQuestion } from "@/lib/textbookAuto/practiceItems";

/** 2단계 AI에 질문+보기 맥락을 넘기기 위한 한 덩어리 문자열 */
export function stubQuestionLineForUnitTest(item: TextbookUnitTestItem): string {
  if (item.kind === "short") return item.question.trim();
  const q = item.question.trim();
  const lines: string[] = [];
  item.choices.forEach((c, i) => {
    const t = c.trim();
    if (t) lines.push(`${i + 1}. ${t}`);
  });
  if (!q && lines.length === 0) return "";
  return lines.length ? `${q}\n${lines.join("\n")}` : q;
}

/** 문항 id: u{unitIndex}-p-{i} 확인학습, u{unitIndex}-t-{i} 단원평가 */
export function buildAnswerKeyStubs(unitIndex: number, unit: TextbookUnitContent): TextbookAnswerKeyStub[] {
  const out: TextbookAnswerKeyStub[] = [];
  let pi = 0;
  for (const p of unit.practice) {
    const t = practiceItemQuestion(p);
    if (!t) continue;
    out.push({ id: `u${unitIndex}-p-${pi}`, question: t });
    pi++;
  }
  let ti = 0;
  for (const item of unit.unitTest) {
    const line = stubQuestionLineForUnitTest(item);
    if (!line) continue;
    out.push({ id: `u${unitIndex}-t-${ti}`, question: line });
    ti++;
  }
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
