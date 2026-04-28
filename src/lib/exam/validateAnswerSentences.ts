const SENT_END = /[.!?。…]/;

/**
 * 단답형 제출 — 최대 `maxSentences`문장(마침표·물음표·느낌표·。 기준) 허용.
 * 문장 구분이 없는 한 줄 답은 1문장으로 취급합니다.
 */
export function countSentences(text: string): number {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return 0;
  if (!SENT_END.test(t)) return 1;
  const chunks = t.split(SENT_END).map((s) => s.trim()).filter((s) => s.length > 0);
  return chunks.length;
}

export function assertMaxSentences(
  text: string,
  maxSentences: number,
): { ok: true } | { ok: false; message: string } {
  const n = countSentences(text);
  if (n === 0) {
    return { ok: false, message: "답안을 입력해 주세요." };
  }
  if (n > maxSentences) {
    return {
      ok: false,
      message: `단답은 최대 ${maxSentences}문장까지 입력할 수 있습니다. (현재 ${n}문장으로 감지됨)`,
    };
  }
  return { ok: true };
}
