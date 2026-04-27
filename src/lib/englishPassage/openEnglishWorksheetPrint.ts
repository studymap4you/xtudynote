/** HTML 이스케이프 */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type EnglishWorksheetPrintPayload = {
  title: string;
  teacherName: string;
  examDate: string;
  passage: string;
  layoutNote: string;
  /** 2단: 직독직해·영작 작성란을 좌우로 분할 */
  layout: "1col" | "2col";
  vocabulary: { word: string; meaning: string }[];
  sentences: { english: string; koreanFull: string }[];
};

function answerArea(twoCol: boolean): string {
  if (twoCol) {
    return `<div class="area-row" aria-hidden="true"><div class="area half"></div><div class="area half"></div></div>`;
  }
  return `<div class="area full" aria-hidden="true"></div>`;
}

/**
 * 새 창에서 문제지 HTML을 연 뒤 인쇄 대화상자를 엽니다.
 * noopener 를 쓰면 일부 브라우저에서 window 참조가 null 이 되어 인쇄가 건너뛰어질 수 있어 사용하지 않습니다.
 */
export function openEnglishWorksheetPrint(payload: EnglishWorksheetPrintPayload): void {
  const V = payload.vocabulary;
  const S = payload.sentences;
  const twoCol = payload.layout === "2col";

  const vocabEnKo = V.map(
    (v, i) =>
      `<div class="q"><span class="n">${i + 1}.</span> <strong>${esc(v.word)}</strong> — 한글 뜻: <span class="line"></span></div>`,
  ).join("");

  const vocabKoEn = V.map(
    (v, i) =>
      `<div class="q"><span class="n">${i + 1}.</span> <strong>${esc(v.meaning)}</strong> — 영어 단어: <span class="line"></span></div>`,
  ).join("");

  const area = answerArea(twoCol);

  const direct = S.map(
    (s, i) =>
      `<div class="block"><p class="n">${i + 1}. 직독직해 — 아래 영문을 한국어로 옮겨 쓰세요.</p>
      <p class="en">${esc(s.english)}</p>
      ${area}</div>`,
  ).join("");

  const writing = S.map(
    (s, i) =>
      `<div class="block"><p class="n">${i + 1}. 영작 — 아래 한국어를 영문으로 옮겨 쓰세요.</p>
      <p class="ko">${esc(s.koreanFull)}</p>
      ${area}</div>`,
  ).join("");

  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"/><title>${esc(payload.title)}</title>
<style>
  @page { margin: 14mm; }
  body { font-family: system-ui, "Malgun Gothic", sans-serif; color: #111; font-size: 11pt; line-height: 1.45; }
  h1 { font-size: 15pt; margin: 0 0 6px; }
  .meta { font-size: 9.5pt; color: #555; margin-bottom: 14px; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }
  h2 { font-size: 11.5pt; color: #2563eb; margin: 16px 0 8px; }
  .passage { white-space: pre-wrap; background: #f8fafc; padding: 10px; border: 1px solid #e2e8f0; margin-bottom: 12px; font-size: 10pt; }
  .q { margin-bottom: 10px; }
  .n { font-weight: 700; color: #2563eb; }
  .line { display: inline-block; min-width: 180px; border-bottom: 1px solid #334155; }
  .block { margin-bottom: 14px; page-break-inside: avoid; }
  .en { font-size: 10.5pt; margin: 6px 0; padding: 8px; background: #f1f5f9; border-left: 3px solid #2563eb; }
  .ko { font-size: 10.5pt; margin: 6px 0; padding: 8px; background: #eff6ff; border-left: 3px solid #2563eb; white-space: pre-wrap; }
  .area-row { display: flex; gap: 10px; margin-top: 8px; align-items: stretch; }
  .area { border: 1px dashed #94a3b8; border-radius: 4px; box-sizing: border-box; }
  .area.full { min-height: 72px; width: 100%; }
  .area.half { flex: 1; min-height: 72px; min-width: 0; }
  @media print {
    .area { border-color: #64748b; }
  }
</style></head><body>
  <h1>${esc(payload.title)}</h1>
  <div class="meta">Xtudy-Universe · English Lab · 담당 ${esc(payload.teacherName)} · 시행일 ${esc(payload.examDate)} · ${esc(payload.layoutNote)}</div>
  <h2>원문 지문</h2>
  <div class="passage">${esc(payload.passage)}</div>
  <h2>A. 어휘 — 영어 → 한글 (뜻 쓰기)</h2>
  ${vocabEnKo}
  <h2>B. 어휘 — 한글 → 영어 (단어 쓰기)</h2>
  ${vocabKoEn}
  <h2>C. 직독직해 (영문 → 한국어 해석 전체)</h2>
  ${direct}
  <h2>D. 영작 (한국어 해석 → 영문 전체)</h2>
  ${writing}
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    throw new Error("팝업이 차단되었습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도해 주세요.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();

  window.setTimeout(() => {
    try {
      w.focus();
      w.print();
    } catch {
      /* noop */
    }
  }, 400);
}
