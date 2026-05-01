import type { WorksheetDocxFormPayload } from "@/lib/worksheet/downloadWorksheetFormDocx";
import { PRINT_PAGE_MARGIN_MM } from "@/lib/print/reactToPrintPageStyle";

/** 학생용 인쇄 — 확인문제 정답 미포함 (서버 PDF와 동일) */
export type WorksheetFormPrintPayload = Omit<WorksheetDocxFormPayload, "exerciseAnswers">;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function blockSection(title: string, body: string): string {
  const t = body.trim();
  const inner = t ? esc(t) : "<em>(없음)</em>";
  return `<h2 class="sec">${esc(title)}</h2><div class="block">${inner.replace(/\n/g, "<br/>")}</div>`;
}

/**
 * 입력 폼과 동일한 구성의 학습지 HTML을 새 창에서 열고 인쇄합니다.
 */
export function openWorksheetFormPrint(payload: WorksheetFormPrintPayload): void {
  const unit = payload.unit.trim();
  const teacherName = payload.teacherName.trim() || "선생님";

  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${esc(unit || "학습지")}</title>
<style>
  /* 인쇄 대화상자 여백은 「없음」 권장 — @page margin이 모든 페이지에 적용됩니다. */
  @page { size: A4 portrait; margin: ${PRINT_PAGE_MARGIN_MM}mm; }
  html { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    font-family: system-ui, "Malgun Gothic", sans-serif;
    color: #111;
    font-size: 11pt;
    line-height: 1.6;
  }
  .brand { font-size: 9pt; font-weight: 700; color: #64748b; margin: 0 0 8px; letter-spacing: 0.03em; }
  h1 {
    font-size: 18pt;
    margin: 0 0 12px;
    color: #0f172a;
    font-weight: 800;
    letter-spacing: -0.02em;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 10px;
  }
  .meta { font-size: 9.5pt; color: #475569; margin-bottom: 16px; }
  h2.sec {
    font-size: 11pt;
    color: #1d4ed8;
    margin: 18px 0 8px;
    font-weight: 800;
    page-break-after: avoid;
  }
  .block {
    white-space: pre-wrap;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 11pt;
    color: #1e293b;
    page-break-inside: auto;
  }
  @media print {
    .block { background: #fff; border-color: #cbd5e1; }
  }
</style></head><body>
  <p class="brand">Xtudy-Universe · ${esc(teacherName)} 선생님</p>
  <h1>${esc(unit || "학습지")}</h1>
  <p class="meta">학생용 출력 · 확인문제 정답은 포함되지 않습니다.</p>
  ${blockSection("학습목표", payload.objectives)}
  ${blockSection("학습일자", payload.studyDate.trim() ? payload.studyDate.trim() : "—")}
  ${blockSection("학습내용", payload.content)}
  ${blockSection("확인문제", payload.exercises)}
  ${blockSection("핵심요약", payload.summary)}
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
