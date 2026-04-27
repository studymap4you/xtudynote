import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, type PDFPage, type PDFFont, rgb, type PDFImage } from "pdf-lib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MM = 2.83465;
const PAGE_W = 595.28;
const PAGE_H = 841.89;

const MARGIN_L = 15 * MM;
const MARGIN_R = 15 * MM;
const MARGIN_TOP = 28 * MM;
const MARGIN_BOT = 22 * MM;

const BODY_PT = 10;
const BODY_LH = BODY_PT * 1.55;
const LABEL_PT = 10;
const TITLE_PT = 15;
const HEADER_BRAND_PT = 8;
const FOOTER_SMALL = 7;

export type ExamPaperPdfQuestion = {
  type: "mcq" | "short";
  prompt: string;
  options?: string[];
};

export type ExamPaperPdfLayout = "1col" | "2col";

export type ExamPaperPdfInput = {
  title: string;
  subject: string;
  teacherName: string;
  passage: string;
  layout: ExamPaperPdfLayout;
  studentName?: string;
  studentNo?: string;
  examDate?: string;
  questions: ExamPaperPdfQuestion[];
};

function strip(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
}

function fontPaths(): { regular: string; bold: string } {
  const base = join(__dirname, "..", "assets", "fonts");
  return {
    regular: join(base, "Pretendard-Regular.otf"),
    bold: join(base, "Pretendard-Bold.otf"),
  };
}

function logoPath(): string {
  return join(__dirname, "..", "assets", "logo.png");
}

function wrapLines(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const out: string[] = [];
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
  for (let pi = 0; pi < paragraphs.length; pi++) {
    const para = paragraphs[pi];
    let line = "";
    for (const ch of para) {
      const next = line + ch;
      if (font.widthOfTextAtSize(next, fontSize) <= maxWidth || line.length === 0) {
        line = next;
      } else {
        out.push(line);
        line = ch === " " ? "" : ch;
      }
    }
    if (line.length > 0) out.push(line);
    if (pi < paragraphs.length - 1) out.push("");
  }
  return out;
}

function safeFilenamePart(s: string): string {
  const t = s.replace(/[/\\?%*:|"<>\x00-\x1f]/g, "_").trim();
  return t.length > 0 ? t.slice(0, 120) : "시험지";
}

export function buildExamPaperPdfFilename(input: ExamPaperPdfInput): string {
  const datePart = safeFilenamePart(input.examDate || new Date().toISOString().slice(0, 10));
  const titlePart = safeFilenamePart(input.title || "시험");
  return `${datePart}_${titlePart}.pdf`;
}

/** 문항 블록 높이 (그리기 없이 추정) */
function estimateQuestionBlockHeight(
  q: ExamPaperPdfQuestion,
  font: PDFFont,
  maxW: number,
): number {
  const promptLines = wrapLines(q.prompt || "(발문 없음)", font, BODY_PT, maxW);
  let h = promptLines.length * BODY_LH + 8;
  if (q.type === "mcq" && Array.isArray(q.options)) {
    for (let i = 0; i < q.options.length; i++) {
      const label = `${i + 1}. ${q.options[i] ?? ""}`;
      const lines = wrapLines(label, font, BODY_PT * 0.95, maxW - 8);
      h += lines.length * BODY_LH * 0.95 + 2;
    }
    h += 16; /* 답안 작성란 */
  } else {
    h += 52; /* 주관식 작성란 */
  }
  return h + 10;
}

export async function buildExamPaperPdfBytes(input: ExamPaperPdfInput): Promise<Uint8Array> {
  const title = strip(input.title) || "시험";
  const subject = strip(input.subject) || "—";
  const teacherName = strip(input.teacherName) || "선생님";
  const passage = strip(input.passage);
  const layout = input.layout === "2col" ? "2col" : "1col";
  const studentName = strip(input.studentName);
  const studentNo = strip(input.studentNo);
  const examDate = strip(input.examDate);

  const fp = fontPaths();
  if (!existsSync(fp.regular) || !existsSync(fp.bold)) {
    throw new Error("Pretendard font files missing under functions/assets/fonts/");
  }

  const regBytes = readFileSync(fp.regular);
  const boldBytes = readFileSync(fp.bold);

  const pdfDoc = await PDFDocument.create();
  const fontReg = await pdfDoc.embedFont(regBytes);
  const fontBold = await pdfDoc.embedFont(boldBytes);

  let logoImg: PDFImage | null = null;
  const lp = logoPath();
  if (existsSync(lp)) {
    try {
      const imgBytes = readFileSync(lp);
      logoImg = await pdfDoc.embedPng(imgBytes);
    } catch {
      logoImg = null;
    }
  }

  const contentWidth = PAGE_W - MARGIN_L - MARGIN_R;
  const footerBand = 20;
  const minY = MARGIN_BOT + footerBand + 10;
  const gutter = 10;

  const colW = layout === "2col" ? (contentWidth - gutter) / 2 : contentWidth;
  const xRightCol = MARGIN_L + colW + gutter;

  const issueLabel = examDate || new Date().toLocaleDateString("ko-KR", { dateStyle: "medium" });

  const pages: PDFPage[] = [];

  const drawHeader = (pg: PDFPage): number => {
    const headerGray = rgb(0.52, 0.55, 0.58);
    const bandTop = PAGE_H - MARGIN_TOP;
    let bandBottom = bandTop;

    const logoMaxH = 26;
    const logoMaxW = 108;
    if (logoImg) {
      const iw = logoImg.width;
      const ih = logoImg.height;
      const scale = Math.min(logoMaxW / iw, logoMaxH / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const lx = MARGIN_L;
      const ly = bandTop - dh;
      pg.drawImage(logoImg, { x: lx, y: ly, width: dw, height: dh });
      bandBottom = Math.min(bandBottom, ly - 4);
    } else {
      pg.drawRectangle({
        x: MARGIN_L,
        y: bandTop - logoMaxH,
        width: logoMaxW,
        height: logoMaxH,
        borderColor: rgb(0.85, 0.88, 0.92),
        borderWidth: 0.6,
        color: rgb(0.97, 0.98, 0.99),
      });
      pg.drawText("Xtudy-Universe", {
        x: MARGIN_L + 6,
        y: bandTop - logoMaxH + 8,
        size: 8,
        font: fontReg,
        color: headerGray,
      });
      bandBottom = bandTop - logoMaxH - 6;
    }

    const brandLine = `Xtudy-Universe · 표준 시험지`;
    const brandSize = HEADER_BRAND_PT;
    const bw = fontReg.widthOfTextAtSize(brandLine, brandSize);
    pg.drawText(brandLine, {
      x: PAGE_W - MARGIN_R - bw,
      y: bandTop - brandSize - 2,
      size: brandSize,
      font: fontReg,
      color: headerGray,
    });

    const examTitleSize = TITLE_PT;
    pg.drawText(title, {
      x: MARGIN_L,
      y: bandBottom - examTitleSize - 6,
      size: examTitleSize,
      font: fontBold,
      color: rgb(0.06, 0.09, 0.14),
    });
    bandBottom = bandBottom - examTitleSize - 14;

    const meta1 = `과목: ${subject}   담당: ${teacherName}   시행일: ${examDate || "________"}`;
    pg.drawText(meta1, {
      x: MARGIN_L,
      y: bandBottom - 10,
      size: 9,
      font: fontReg,
      color: rgb(0.22, 0.25, 0.3),
    });
    bandBottom -= 22;

    const sn = studentName || "________________";
    const sno = studentNo || "________________";
    pg.drawText(`학생 이름: ${sn}                    학번(번호): ${sno}`, {
      x: MARGIN_L,
      y: bandBottom - 10,
      size: 9.5,
      font: fontBold,
      color: rgb(0.1, 0.14, 0.2),
    });
    bandBottom -= 24;

    const lineY = bandBottom;
    pg.drawRectangle({
      x: MARGIN_L,
      y: lineY - 0.5,
      width: PAGE_W - MARGIN_L - MARGIN_R,
      height: 0.5,
      color: rgb(0.82, 0.85, 0.88),
    });

    return lineY - 12;
  };

  const drawFootersAll = () => {
    const gray = rgb(0.42, 0.45, 0.48);
    const fs = FOOTER_SMALL;
    const yBase = MARGIN_BOT + 6;
    pages.forEach((pg, i) => {
      const idx = i + 1;
      const tag = "Xtudy-Universe";
      const issued = `발행일자 ${issueLabel}`;
      const center = `- ${idx} -`;
      pg.drawText(tag, { x: MARGIN_L, y: yBase, size: fs, font: fontReg, color: gray });
      const cw = fontReg.widthOfTextAtSize(center, fs);
      pg.drawText(center, {
        x: (PAGE_W - cw) / 2,
        y: yBase,
        size: fs,
        font: fontReg,
        color: gray,
      });
      const iw = fontReg.widthOfTextAtSize(issued, fs);
      pg.drawText(issued, {
        x: PAGE_W - MARGIN_R - iw,
        y: yBase,
        size: fs,
        font: fontReg,
        color: gray,
      });
    });
  };

  const openNewPage = (): { page: PDFPage; cursor: number } => {
    const pg = pdfDoc.addPage([PAGE_W, PAGE_H]);
    pages.push(pg);
    return { page: pg, cursor: drawHeader(pg) };
  };

  let { page, cursor: y } = openNewPage();
  const sepColor = rgb(0.88, 0.9, 0.93);

  const ensureSpace = (need: number): void => {
    if (y - need < minY) {
      const next = openNewPage();
      page = next.page;
      y = next.cursor;
    }
  };

  const drawSeparator = (yy: number): number => {
    page.drawRectangle({
      x: MARGIN_L,
      y: yy - 0.35,
      width: PAGE_W - MARGIN_L - MARGIN_R,
      height: 0.35,
      color: sepColor,
    });
    return yy - 8;
  };

  /** 본문: 최대 높이 제한 후 생략 안내 */
  const maxPassageH = 140;
  ensureSpace(maxPassageH + 36);
  y = drawSeparator(y);
  page.drawText("본문", {
    x: MARGIN_L,
    y: y - LABEL_PT,
    size: LABEL_PT,
    font: fontBold,
    color: rgb(0.12, 0.16, 0.22),
  });
  y -= LABEL_PT + 6;

  const passageLines = passage
    ? wrapLines(passage, fontReg, BODY_PT, contentWidth)
    : ["(본문 없음)"];
  let used = 0;
  const lh = BODY_LH;
  for (const ln of passageLines) {
    if (used > maxPassageH) break;
    if (ln === "") {
      y -= lh * 0.4;
      continue;
    }
    ensureSpace(lh + 4);
    page.drawText(ln.length > 800 ? ln.slice(0, 800) + "…" : ln, {
      x: MARGIN_L,
      y: y - BODY_PT,
      size: BODY_PT,
      font: fontReg,
      color: rgb(0.18, 0.22, 0.28),
    });
    y -= lh;
    used += lh;
  }
  if (passageLines.join("\n").length > 3500) {
    page.drawText("(본문 일부만 표시되었습니다. 원문은 디지털 자료를 참고하세요.)", {
      x: MARGIN_L,
      y: y - BODY_PT,
      size: 8,
      font: fontReg,
      color: rgb(0.45, 0.48, 0.52),
    });
    y -= lh;
  }
  y -= 8;

  /** 단일 페이지 행 안에서만 그림 (2단 동시 배치용) */
  const drawQuestionFlat = (
    pg: PDFPage,
    q: ExamPaperPdfQuestion,
    num: number,
    x0: number,
    maxW: number,
    startY: number,
  ): { y: number } => {
    let yy = startY;
    const head = `${num}. ${q.prompt}`;
    const lines = wrapLines(head, fontReg, BODY_PT, maxW);
    for (const ln of lines) {
      pg.drawText(ln, {
        x: x0,
        y: yy - BODY_PT,
        size: BODY_PT,
        font: fontReg,
        color: rgb(0.1, 0.12, 0.16),
      });
      yy -= BODY_LH;
    }
    yy -= 4;

    if (q.type === "mcq" && Array.isArray(q.options)) {
      for (let i = 0; i < q.options.length; i++) {
        const label = `${i + 1}) ${q.options[i] ?? ""}`;
        const optLines = wrapLines(label, fontReg, BODY_PT * 0.92, maxW - 6);
        for (const ol of optLines) {
          pg.drawText(ol, {
            x: x0 + 6,
            y: yy - BODY_PT * 0.92,
            size: BODY_PT * 0.92,
            font: fontReg,
            color: rgb(0.2, 0.22, 0.28),
          });
          yy -= BODY_LH * 0.95;
        }
      }
      pg.drawText("답란: (    )", {
        x: x0,
        y: yy - 10,
        size: 9.5,
        font: fontBold,
        color: rgb(0.25, 0.3, 0.35),
      });
      yy -= 22;
    } else {
      const boxH = 44;
      pg.drawRectangle({
        x: x0,
        y: yy - boxH,
        width: maxW,
        height: boxH,
        borderColor: rgb(0.82, 0.85, 0.88),
        borderWidth: 0.45,
      });
      yy -= boxH + 8;
    }
    yy -= 8;
    return { y: yy };
  };

  const drawQuestionBlock = (
    pg: PDFPage,
    q: ExamPaperPdfQuestion,
    num: number,
    x0: number,
    maxW: number,
    startY: number,
  ): { page: PDFPage; y: number } => {
    let yy = startY;
    let p = pg;

    const head = `${num}. ${q.prompt}`;
    const lines = wrapLines(head, fontReg, BODY_PT, maxW);
    for (const ln of lines) {
      if (yy - BODY_LH < minY) {
        const nx = openNewPage();
        p = nx.page;
        yy = nx.cursor;
      }
      p.drawText(ln, {
        x: x0,
        y: yy - BODY_PT,
        size: BODY_PT,
        font: fontReg,
        color: rgb(0.1, 0.12, 0.16),
      });
      yy -= BODY_LH;
    }
    yy -= 4;

    if (q.type === "mcq" && Array.isArray(q.options)) {
      for (let i = 0; i < q.options.length; i++) {
        const label = `${i + 1}) ${q.options[i] ?? ""}`;
        const optLines = wrapLines(label, fontReg, BODY_PT * 0.92, maxW - 6);
        for (const ol of optLines) {
          if (yy - BODY_LH < minY) {
            const nx = openNewPage();
            p = nx.page;
            yy = nx.cursor;
          }
          p.drawText(ol, {
            x: x0 + 6,
            y: yy - BODY_PT * 0.92,
            size: BODY_PT * 0.92,
            font: fontReg,
            color: rgb(0.2, 0.22, 0.28),
          });
          yy -= BODY_LH * 0.95;
        }
      }
      if (yy - 28 < minY) {
        const nx = openNewPage();
        p = nx.page;
        yy = nx.cursor;
      }
      p.drawText("답란: (    )", {
        x: x0,
        y: yy - 10,
        size: 9.5,
        font: fontBold,
        color: rgb(0.25, 0.3, 0.35),
      });
      yy -= 22;
    } else {
      const boxH = 48;
      if (yy - boxH < minY) {
        const nx = openNewPage();
        p = nx.page;
        yy = nx.cursor;
      }
      p.drawRectangle({
        x: x0,
        y: yy - boxH,
        width: maxW,
        height: boxH,
        borderColor: rgb(0.82, 0.85, 0.88),
        borderWidth: 0.45,
      });
      yy -= boxH + 8;
    }
    yy -= 8;
    return { page: p, y: yy };
  };

  const questions = input.questions ?? [];
  ensureSpace(24);
  y = drawSeparator(y);
  page.drawText("문항", {
    x: MARGIN_L,
    y: y - LABEL_PT,
    size: LABEL_PT,
    font: fontBold,
    color: rgb(0.12, 0.16, 0.22),
  });
  y -= LABEL_PT + 10;

  if (layout === "1col") {
    for (let i = 0; i < questions.length; i++) {
      const need = estimateQuestionBlockHeight(questions[i]!, fontReg, contentWidth) + 8;
      ensureSpace(need);
      const r = drawQuestionBlock(page, questions[i]!, i + 1, MARGIN_L, contentWidth, y);
      page = r.page;
      y = r.y;
    }
  } else {
    for (let i = 0; i < questions.length; i += 2) {
      const q1 = questions[i]!;
      const q2 = questions[i + 1];
      const h1 = estimateQuestionBlockHeight(q1, fontReg, colW);
      const h2 = q2 ? estimateQuestionBlockHeight(q2, fontReg, colW) : 0;
      const rowH = Math.max(h1, h2, 40);
      ensureSpace(rowH + 12);
      const rowTop = y;
      drawQuestionFlat(page, q1, i + 1, MARGIN_L, colW, rowTop);
      if (q2) {
        drawQuestionFlat(page, q2, i + 2, xRightCol, colW, rowTop);
      }
      y = rowTop - rowH;
    }
  }

  drawFootersAll();
  return pdfDoc.save();
}
