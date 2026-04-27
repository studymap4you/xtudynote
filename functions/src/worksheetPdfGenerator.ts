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
const MARGIN_TOP = 30 * MM;
const MARGIN_BOT = 25 * MM;

const BODY_PT = 11;
const BODY_LH = BODY_PT * 1.6;
const LABEL_PT = 11;
const TITLE_PT = 24;
const FOOTER_SMALL = 7;
const HEADER_BRAND_PT = 9;

export type WorksheetPdfInput = {
  unit: string;
  objectives: string;
  studyDate: string;
  content: string;
  exercises: string;
  summary: string;
  teacherName: string;
};

function strip(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
}

function safeFilenamePart(s: string): string {
  const t = s.replace(/[/\\?%*:|"<>\x00-\x1f]/g, "_").trim();
  return t.length > 0 ? t.slice(0, 120) : "미입력";
}

/** [날짜]_[선생님성함]_[학습단원].pdf */
export function buildWorksheetPdfFilename(input: WorksheetPdfInput): string {
  const datePart = safeFilenamePart(input.studyDate || new Date().toISOString().slice(0, 10));
  const teacherPart = safeFilenamePart(input.teacherName || "선생님");
  const unitPart = safeFilenamePart(input.unit || "학습지");
  return `${datePart}_${teacherPart}_${unitPart}.pdf`;
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

export async function buildWorksheetPdfBytes(input: WorksheetPdfInput): Promise<Uint8Array> {
  const unit = strip(input.unit);
  const objectives = strip(input.objectives);
  const studyDate = strip(input.studyDate);
  const content = strip(input.content);
  const exercises = strip(input.exercises);
  const summary = strip(input.summary);
  const teacherName = strip(input.teacherName) || "선생님";

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
  const footerBand = 22;
  const minY = MARGIN_BOT + footerBand + 10;

  const issueLabel = studyDate || new Date().toLocaleDateString("ko-KR", { dateStyle: "medium" });

  const pages: PDFPage[] = [];

  const drawHeader = (pg: PDFPage): number => {
    const headerGray = rgb(0.55, 0.58, 0.62);
    const bandTop = PAGE_H - MARGIN_TOP;
    let bandBottom = bandTop;

    const logoMaxH = 28;
    const logoMaxW = 120;
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
      pg.drawText("학원 로고", {
        x: MARGIN_L + 6,
        y: bandTop - logoMaxH + 9,
        size: 8,
        font: fontReg,
        color: headerGray,
      });
      bandBottom = bandTop - logoMaxH - 6;
    }

    const brandLine = `Xtudy-Universe · ${teacherName} 선생님`;
    const brandSize = HEADER_BRAND_PT;
    const bw = fontReg.widthOfTextAtSize(brandLine, brandSize);
    pg.drawText(brandLine, {
      x: PAGE_W - MARGIN_R - bw,
      y: bandTop - brandSize - 2,
      size: brandSize,
      font: fontReg,
      color: headerGray,
    });

    const lineY = Math.min(bandBottom, bandTop - 36) - 4;
    pg.drawRectangle({
      x: MARGIN_L,
      y: lineY - 0.5,
      width: PAGE_W - MARGIN_L - MARGIN_R,
      height: 0.5,
      color: rgb(0.82, 0.85, 0.88),
    });

    return lineY - 14;
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
    return yy - 10;
  };

  const drawWrapped = (label: string, body: string): void => {
    const labelSize = LABEL_PT;
    const bodySize = BODY_PT;
    const lh = BODY_LH;

    const labelH = labelSize + 8;
    const lines = body.length > 0 ? wrapLines(body, fontReg, bodySize, contentWidth) : ["(없음)"];
    const bodyBlockH = lines.length * lh + 6;

    ensureSpace(labelH + bodyBlockH + 18);

    y = drawSeparator(y);
    page.drawText(label, {
      x: MARGIN_L,
      y: y - labelSize,
      size: labelSize,
      font: fontBold,
      color: rgb(0.12, 0.16, 0.22),
    });
    y -= labelH;

    for (const ln of lines) {
      if (ln === "") {
        y -= lh * 0.45;
        continue;
      }
      ensureSpace(lh + 4);
      page.drawText(ln, {
        x: MARGIN_L,
        y: y - bodySize,
        size: bodySize,
        font: fontReg,
        color: rgb(0.18, 0.22, 0.28),
      });
      y -= lh;
    }
    y -= 8;
  };

  if (unit) {
    ensureSpace(TITLE_PT + 30);
    y = drawSeparator(y);
    page.drawText(unit, {
      x: MARGIN_L,
      y: y - TITLE_PT,
      size: TITLE_PT,
      font: fontBold,
      color: rgb(0.06, 0.09, 0.14),
    });
    y -= TITLE_PT + 20;
  }

  drawWrapped("학습목표", objectives);
  drawWrapped("학습일자", studyDate || "—");
  drawWrapped("학습내용", content);
  drawWrapped("확인문제", exercises);
  drawWrapped("핵심요약", summary);

  drawFootersAll();

  return pdfDoc.save();
}
