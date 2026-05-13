import type { TextbookAnswerKeyItem, TextbookUnitContent } from "@/types/textbookAuto";
import { stubQuestionLineForUnitTest } from "@/lib/textbookAuto/buildAnswerKeyStubs";
import { practiceItemQuestion } from "@/lib/textbookAuto/practiceItems";

function normalizeBullets(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x === "string") {
      const t = x.trim();
      if (t) out.push(t);
    }
    if (out.length >= max) break;
  }
  return out;
}

export function buildAnswerKeyItemsFromUnit(unitIndex: number, unit: TextbookUnitContent): TextbookAnswerKeyItem[] {
  const out: TextbookAnswerKeyItem[] = [];
  let pi = 0;
  for (const p of unit.practice) {
    const q = practiceItemQuestion(p);
    if (!q) continue;
    const answer = typeof p.answer === "string" ? p.answer.trim() : "";
    const explanationBullets = normalizeBullets(p.explanationBullets, 25);
    out.push({
      id: `u${unitIndex}-p-${pi}`,
      unitIndex,
      bucket: "practice",
      orderIndex: pi,
      question: q,
      answer: answer || "—",
      explanationBullets,
    });
    pi++;
  }
  let ti = 0;
  for (const ut of unit.unitTest) {
    const line = stubQuestionLineForUnitTest(ut);
    if (!line) continue;
    const answer = "answer" in ut && typeof ut.answer === "string" ? ut.answer.trim() : "";
    const explanationBullets =
      "explanationBullets" in ut && ut.explanationBullets
        ? normalizeBullets(ut.explanationBullets, 25)
        : [];
    out.push({
      id: `u${unitIndex}-t-${ti}`,
      unitIndex,
      bucket: "unitTest",
      orderIndex: ti,
      question: line,
      answer: answer || "—",
      explanationBullets,
    });
    ti++;
  }
  return out;
}

export function embeddedNeedsAiFill(item: TextbookAnswerKeyItem): boolean {
  const ans = item.answer.trim();
  const ansEmpty = !ans || ans === "—";
  const expEmpty = item.explanationBullets.filter((s) => s.trim()).length === 0;
  return ansEmpty || expEmpty;
}

export function mergeAnswerKeyAiWithEmbedded(
  embedded: TextbookAnswerKeyItem[],
  ai: TextbookAnswerKeyItem[],
): TextbookAnswerKeyItem[] {
  const aiById = new Map(ai.map((x) => [x.id, x]));
  return embedded.map((e) => {
    const a = aiById.get(e.id);
    if (!a) return e;
    const ans = e.answer.trim();
    const useAiAns = !ans || ans === "—";
    const exp = e.explanationBullets.filter((s) => s.trim());
    const useAiExp = exp.length === 0;
    return {
      ...e,
      answer: useAiAns ? a.answer : e.answer,
      explanationBullets: useAiExp ? [...a.explanationBullets] : e.explanationBullets,
    };
  });
}
