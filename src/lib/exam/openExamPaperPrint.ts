import type { ExamPaperPdfPayload } from "@/lib/exam/examPaperPdfClient";
import { PRINT_PAGE_MARGIN_MM } from "@/lib/print/reactToPrintPageStyle";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layoutLabel(layout: "1col" | "2col"): string {
  return layout === "2col" ? "2단 (좌우)" : "1단 (세로 한 줄)";
}

function buildQuestionsHtml(
  questions: ExamPaperPdfPayload["questions"],
  twoCol: boolean,
): string {
  const blocks = questions.map((q, i) => {
    const n = i + 1;
    const head = `<p class="q-head"><span class="q-num">${n}.</span> ${esc(q.prompt || "")}</p>`;
    if (q.type === "mcq" && Array.isArray(q.options)) {
      const opts = q.options
        .map((opt, j) => `<li class="opt"><span class="opt-num">${j + 1})</span> ${esc(opt ?? "")}</li>`)
        .join("");
      return `<div class="q-block">
        ${head}
        <ol class="opts">${opts}</ol>
        <p class="answer-slot">답란: <span class="paren">(&nbsp;&nbsp;&nbsp;&nbsp;)</span></p>
      </div>`;
    }
    return `<div class="q-block">
      ${head}
      <div class="write-area" aria-hidden="true"></div>
    </div>`;
  });
  const inner = blocks.join("");
  return `<div class="${twoCol ? "q-sheet q-sheet--2col" : "q-sheet"}">${inner}</div>`;
}

/**
 * 새 창에서 시험지 HTML을 연 뒤 인쇄 대화상자를 엽니다. 사용자가 「PDF로 저장」을 선택할 수 있습니다.
 */
export function openExamPaperPrint(payload: ExamPaperPdfPayload): void {
  const title = payload.title.trim() || "시험";
  const subject = payload.subject.trim() || "—";
  const teacherName = payload.teacherName.trim() || "선생님";
  const passage = payload.passage.trim();
  const examDate = (payload.examDate || "").trim() || "________";
  const studentName = (payload.studentName || "").trim() || "________________";
  const studentNo = (payload.studentNo || "").trim() || "________________";
  const twoCol = payload.layout === "2col";
  const lay = layoutLabel(payload.layout);

  const questionsHtml = buildQuestionsHtml(payload.questions, twoCol);

  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${esc(title)}</title>
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
    font-size: 10.5pt;
    line-height: 1.45;
  }
  .brand { font-size: 8.5pt; font-weight: 700; letter-spacing: 0.04em; color: #64748b; margin: 0 0 4px; }
  h1 { font-size: 15pt; margin: 0 0 6px; color: #0f172a; }
  .meta-line {
    font-size: 9.5pt;
    color: #334155;
    margin-bottom: 6px;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 8px;
  }
  .student-line {
    font-size: 9.5pt;
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 10px;
  }
  h2 {
    font-size: 11pt;
    color: #1d4ed8;
    margin: 14px 0 8px;
    page-break-after: avoid;
  }
  .passage {
    white-space: pre-wrap;
    background: #f8fafc;
    padding: 10px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 10pt;
    margin-bottom: 12px;
    page-break-inside: avoid;
  }
  .q-sheet--2col {
    column-count: 2;
    column-gap: 14px;
    column-rule: 1px solid #cbd5e1;
  }
  .q-block {
    break-inside: avoid;
    page-break-inside: avoid;
    margin-bottom: 14px;
  }
  .q-head { margin: 0 0 6px; font-size: 10.5pt; color: #0f172a; }
  .q-num { font-weight: 800; color: #2563eb; margin-right: 4px; }
  .opts {
    margin: 4px 0 8px;
    padding-left: 1.15rem;
    font-size: 10pt;
    color: #1e293b;
  }
  .opt { margin-bottom: 3px; }
  .opt-num { font-weight: 600; margin-right: 4px; }
  .answer-slot { font-size: 9.5pt; font-weight: 700; color: #334155; margin: 6px 0 0; }
  .paren { letter-spacing: 0.12em; }
  .write-area {
    min-height: 72px;
    border: 1px dashed #94a3b8;
    border-radius: 4px;
    margin-top: 8px;
  }
  @media print {
    .write-area { border-color: #64748b; }
  }
</style></head><body>
  <p class="brand">Xtudy-Universe · 표준 시험지 (인쇄용)</p>
  <h1>${esc(title)}</h1>
  <p class="meta-line">과목: ${esc(subject)} · 담당: ${esc(teacherName)} · 시행일: ${esc(examDate)} · 레이아웃: ${esc(lay)}</p>
  <p class="student-line">학생 이름: ${esc(studentName)} &nbsp;&nbsp;&nbsp; 학번(번호): ${esc(studentNo)}</p>
  <h2>본문</h2>
  <div class="passage">${esc(passage || "(본문 없음)")}</div>
  <h2>문항</h2>
  ${questionsHtml}
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
