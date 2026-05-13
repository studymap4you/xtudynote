import type {
  TextbookPracticeItem,
  TextbookUnitEvalQuestionSetup,
  TextbookUnitReviewStudySetup,
  TextbookUnitTestItem,
  TextbookUnitTestMcq,
  TextbookUnitTestShort,
} from "@/types/textbookAuto";

/** 선택지 문자열 → 최대 5개 보기 (①… 또는 줄 단위) */
export function parseMcqOptionsToChoices(raw: string, max = 5): string[] {
  const lines = raw
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    const m = line.match(/^[①②③④⑤]\s*(.+)$/) || line.match(/^\d+[\.)]\s*(.+)$/);
    out.push(m ? m[1]!.trim() : line.trim());
  }
  return out.filter(Boolean).slice(0, max);
}

export function padMcqChoicesToFive(choices: string[]): string[] {
  const c = [...choices];
  while (c.length < 5) c.push("");
  return c.slice(0, 5);
}

function splitReviewBodyToQuestions(body: string): string[] {
  const t = body.trim();
  if (!t) return [];
  if (t.includes("\n\n---\n\n")) {
    return t
      .split(/\n\n---\n\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  const numbered = lines.filter((l) => /^\d+[\.)]\s+/.test(l));
  if (numbered.length >= 2) {
    return numbered.map((l) => l.replace(/^\d+[\.)]\s+/, "").trim()).filter(Boolean);
  }
  return [t];
}

export function buildPracticeItemsFromReviewSetup(setup: TextbookUnitReviewStudySetup): TextbookPracticeItem[] {
  const parts = splitReviewBodyToQuestions(setup.body);
  const out: TextbookPracticeItem[] = [];
  for (const q of parts) {
    const s = q.trim();
    if (s) out.push({ question: s });
  }
  const expected = Math.max(1, setup.questionCount);
  if (out.length >= expected) return out.slice(0, expected);
  if (out.length === 0) return [];
  const single = out[0]!;
  while (out.length < expected) {
    out.push({ question: `${single.question} (${out.length + 1})` });
  }
  return out.slice(0, expected);
}

export function evalQuestionToUnitTestItem(q: TextbookUnitEvalQuestionSetup): TextbookUnitTestItem | null {
  const stem = q.stem.trim();
  if (!stem) return null;
  if (q.kind === "short") {
    const s: TextbookUnitTestShort = { kind: "short", question: stem };
    return s;
  }
  const rawChoices = parseMcqOptionsToChoices(q.options, 5);
  const choices = padMcqChoicesToFive(rawChoices);
  const filled = choices.filter((c) => c.trim()).length;
  if (filled < 2) return null;
  const mcq: TextbookUnitTestMcq = { kind: "mcq", question: stem, choices };
  return mcq;
}

export function buildUnitTestFromEvalQuestions(questions: TextbookUnitEvalQuestionSetup[]): TextbookUnitTestItem[] {
  const out: TextbookUnitTestItem[] = [];
  for (const q of questions) {
    const it = evalQuestionToUnitTestItem(q);
    if (it) out.push(it);
  }
  return out;
}

export function formatEvalSlotsLabel(mcq: number, short: number): string {
  return `객관식(5지선다) ${mcq}문항 · 주관식 ${short}문항`;
}
