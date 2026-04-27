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
const MARGIN_TOP = 26 * MM;
const MARGIN_BOT = 22 * MM;

const BODY_PT = 9.5;
const BODY_LH = BODY_PT * 1.45;
const H2_PT = 11;
const TITLE_PT = 14;
const HEADER_BRAND_PT = 8;
const FOOTER_SMALL = 7;

export type EnglishPassagePdfLayout = "1col" | "2col";

export type EnglishPassagePdfSentence = {
  english: string;
  koreanWithBlanks: string;
  compositionKorean: string;
  blankAnswersKo: string[];
  compositionEnglish: string;
};

export type EnglishPassagePdfInput = {
  title: string;
  teacherName: string;
  passage: string;
  layout: EnglishPassagePdfLayout;
  examDate?: string;
  vocabulary: { word: string; meaning: string }[];
  sentences: EnglishPassagePdfSentence[];
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
  return t.length > 0 ? t.slice(0, 120) : "영어학습";
}

export function buildEnglishPassagePdfFilename(input: EnglishPassagePdfInput): string {
  const datePart = safeFilenamePart(input.examDate || new Date().toISOString().slice(0, 10));
  const titlePart = safeFilenamePart(input.title || "지문학습");
  return `${datePart}_${titlePart}.pdf`;
}

export async function buildEnglishPassagePdfBytes(input: EnglishPassagePdfInput): Promise<Uint8Array> {
  const title = strip(input.title) || "영어 지문 학습";
  const teacherName = strip(input.teacherName) || "선생님";
  const passage = strip(input.passage);
  const layout = input.layout === "2col" ? "2col" : "1col";
  const examDate = strip(input.examDate);

  const fp = fontPaths();
  if (!existsSync(fp.regular) || !existsSync(fp.bold)) {
    throw new Error("Pretendard font files missing under functions/assets/fonts/");
  }

  const pdfDoc = await PDFDocument.create();
  const fontReg = await pdfDoc.embedFont(readFileSync(fp.regular));
  const fontBold = await pdfDoc.embedFont(readFileSync(fp.bold));

  let logoImg: PDFImage | null = null;
  const lp = logoPath();
  if (existsSync(lp)) {
    try {
      logoImg = await pdfDoc.embedPng(readFileSync(lp));
    } catch {
      logoImg = null;
    }
  }

  const contentWidth = PAGE_W - MARGIN_L - MARGIN_R;

  const footerBand = 20;
  const minY = MARGIN_BOT + footerBand + 12;
  const blue = rgb(0.145, 0.388, 0.922);
  const muted = rgb(0.42, 0.45, 0.48);

  const pages: PDFPage[] = [];

  const issueLabel = examDate || new Date().toLocaleDateString("ko-KR", { dateStyle: "medium" });

  const drawBrandedHeader = (pg: PDFPage, subtitle: string): number => {
    const bandTop = PAGE_H - MARGIN_TOP;
    let bandBottom = bandTop;

    const logoMaxH = 24;
    const logoMaxW = 100;
    if (logoImg) {
      const iw = logoImg.width;
      const ih = logoImg.height;
      const scale = Math.min(logoMaxW / iw, logoMaxH / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      pg.drawImage(logoImg, { x: MARGIN_L, y: bandTop - dh, width: dw, height: dh });
      bandBottom = Math.min(bandBottom, bandTop - dh - 4);
    }

    const brandLine = `Xtudy-Universe · English Lab`;
    const bw = fontReg.widthOfTextAtSize(brandLine, HEADER_BRAND_PT);
    pg.drawText(brandLine, {
      x: PAGE_W - MARGIN_R - bw,
      y: bandTop - HEADER_BRAND_PT - 2,
      size: HEADER_BRAND_PT,
      font: fontReg,
      color: muted,
    });

    pg.drawText(title, {
      x: MARGIN_L,
      y: bandBottom - TITLE_PT - 6,
      size: TITLE_PT,
      font: fontBold,
      color: rgb(0.06, 0.09, 0.14),
    });
    bandBottom -= TITLE_PT + 12;

    pg.drawText(subtitle, {
      x: MARGIN_L,
      y: bandBottom - 9,
      size: 9,
      font: fontReg,
      color: muted,
    });
    bandBottom -= 16;

    pg.drawRectangle({
      x: MARGIN_L,
      y: bandBottom - 0.5,
      width: PAGE_W - MARGIN_L - MARGIN_R,
      height: 0.6,
      color: blue,
    });

    return bandBottom - 14;
  };

  const drawFootersAll = (): void => {
    const fs = FOOTER_SMALL;
    const yBase = MARGIN_BOT + 6;
    pages.forEach((pg, i) => {
      const idx = i + 1;
      const left = `${teacherName} 선생님`;
      const center = `- ${idx} / ${pages.length} -`;
      const right = issueLabel;

      pg.drawText(left, { x: MARGIN_L, y: yBase, size: fs, font: fontReg, color: muted });
      const cw = fontReg.widthOfTextAtSize(center, fs);
      pg.drawText(center, {
        x: (PAGE_W - cw) / 2,
        y: yBase,
        size: fs,
        font: fontReg,
        color: muted,
      });
      const rw = fontReg.widthOfTextAtSize(right, fs);
      pg.drawText(right, {
        x: PAGE_W - MARGIN_R - rw,
        y: yBase,
        size: fs,
        font: fontReg,
        color: muted,
      });
    });
  };

  const openPage = (): { pg: PDFPage; y: number } => {
    const pg = pdfDoc.addPage([PAGE_W, PAGE_H]);
    pages.push(pg);
    const sub = `담당 ${teacherName} · 시행일 ${examDate || "______"} · 레이아웃 ${layout === "2col" ? "2단" : "1단"}`;
    const y = drawBrandedHeader(pg, sub);
    return { pg, y };
  };

  let { pg: page, y } = openPage();

  const ensureSpace = (need: number): void => {
    if (y - need < minY) {
      const n = openPage();
      page = n.pg;
      y = n.y;
    }
  };

  const drawHeading = (text: string): void => {
    ensureSpace(H2_PT + 14);
    page.drawText(text, {
      x: MARGIN_L,
      y: y - H2_PT,
      size: H2_PT,
      font: fontBold,
      color: blue,
    });
    y -= H2_PT + 10;
  };

  const drawParagraph = (label: string, body: string): void => {
    const lh = BODY_LH;
    const lines = wrapLines(`${label}${body}`, fontReg, BODY_PT, contentWidth);
    ensureSpace(lines.length * lh + 12);
    for (const ln of lines) {
      page.drawText(ln || " ", {
        x: MARGIN_L,
        y: y - BODY_PT,
        size: BODY_PT,
        font: fontReg,
        color: rgb(0.15, 0.18, 0.22),
      });
      y -= lh;
    }
    y -= 6;
  };

  /** 1단 본문 */
  drawHeading("원문 지문");
  drawParagraph("", passage.slice(0, 9000) || "(없음)");
  drawHeading("A. 핵심 어휘");
  ensureSpace(14);
  page.drawText("영단어 → 뜻", {
    x: MARGIN_L,
    y: y - BODY_PT,
    size: BODY_PT,
    font: fontBold,
    color: rgb(0.18, 0.2, 0.26),
  });
  y -= BODY_LH + 6;

  const vocab = input.vocabulary ?? [];
  for (let i = 0; i < vocab.length; i++) {
    const item = vocab[i];
    if (!item) continue;
    const line = `${i + 1}. ${item.word} → ${item.meaning}`;
    const lines = wrapLines(line, fontReg, BODY_PT * 0.92, contentWidth - 4);
    for (const ln of lines) {
      ensureSpace(BODY_LH + 8);
      page.drawText(ln, {
        x: MARGIN_L,
        y: y - BODY_PT * 0.92,
        size: BODY_PT * 0.92,
        font: fontReg,
        color: rgb(0.14, 0.16, 0.2),
      });
      y -= BODY_LH * 0.92;
    }
    y -= 4;
  }

  drawHeading("B. 어휘 확인 (영어 단어를 보고 뜻을 쓰세요)");
  drawParagraph("", "(학생 작성란 — 순서대로 작성)");

  const boxH = Math.min(Math.max(vocab.length * 12, 96), 280);
  ensureSpace(boxH + 12);
  if (layout === "2col") {
    const gw = 8;
    const cw = (contentWidth - gw) / 2;
    page.drawRectangle({
      x: MARGIN_L,
      y: y - boxH,
      width: cw,
      height: boxH,
      borderColor: rgb(0.82, 0.85, 0.88),
      borderWidth: 0.55,
    });
    page.drawRectangle({
      x: MARGIN_L + cw + gw,
      y: y - boxH,
      width: cw,
      height: boxH,
      borderColor: rgb(0.82, 0.85, 0.88),
      borderWidth: 0.55,
    });
  } else {
    page.drawRectangle({
      x: MARGIN_L,
      y: y - boxH,
      width: contentWidth,
      height: boxH,
      borderColor: rgb(0.82, 0.85, 0.88),
      borderWidth: 0.55,
    });
  }
  y -= boxH + 14;

  drawHeading("C. 한국어 해석 빈칸 (직독직해)");
  const sentences = input.sentences ?? [];
  sentences.forEach((s, idx) => {
    const block = `[${idx + 1}] ${s.koreanWithBlanks}`;
    const lines = wrapLines(block, fontReg, BODY_PT, contentWidth);
    ensureSpace(lines.length * BODY_LH + BODY_LH * 5);
    for (const ln of lines) {
      page.drawText(ln, {
        x: MARGIN_L,
        y: y - BODY_PT,
        size: BODY_PT,
        font: fontReg,
        color: rgb(0.12, 0.14, 0.18),
      });
      y -= BODY_LH;
    }
    y -= 8;
    page.drawText("원문:", {
      x: MARGIN_L,
      y: y - BODY_PT,
      size: BODY_PT * 0.85,
      font: fontBold,
      color: rgb(0.45, 0.48, 0.52),
    });
    y -= BODY_LH;
    const enc = wrapLines(s.english, fontReg, BODY_PT * 0.88, contentWidth);
    for (const ln of enc) {
      ensureSpace(BODY_LH);
      page.drawText(ln, {
        x: MARGIN_L,
        y: y - BODY_PT * 0.88,
        size: BODY_PT * 0.88,
        font: fontReg,
        color: rgb(0.35, 0.38, 0.42),
      });
      y -= BODY_LH * 0.92;
    }
    y -= 14;
  });

  drawHeading("D. 영작");
  sentences.forEach((s, idx) => {
    const prompt = `[${idx + 1}] ${s.compositionKorean}`;
    const lines = wrapLines(prompt, fontReg, BODY_PT, contentWidth);
    ensureSpace(lines.length * BODY_LH + 72);
    for (const ln of lines) {
      page.drawText(ln, {
        x: MARGIN_L,
        y: y - BODY_PT,
        size: BODY_PT,
        font: fontReg,
        color: rgb(0.1, 0.12, 0.16),
      });
      y -= BODY_LH;
    }
    page.drawRectangle({
      x: MARGIN_L,
      y: y - 52,
      width: contentWidth,
      height: 52,
      borderColor: rgb(0.82, 0.85, 0.88),
      borderWidth: 0.45,
    });
    y -= 62;
  });

  drawHeading("교사용 정답 요약");
  vocab.forEach((v, idx) => {
    drawParagraph(`${idx + 1}. `, `${v.word} — ${v.meaning}`);
  });
  sentences.forEach((s, idx) => {
    ensureSpace(BODY_LH * 8);
    const blanks = (s.blankAnswersKo ?? []).join(", ");
    page.drawText(`${idx + 1}) 빈칸 정답(한글): ${blanks}`, {
      x: MARGIN_L,
      y: y - BODY_PT,
      size: BODY_PT * 0.88,
      font: fontReg,
      color: rgb(0.22, 0.25, 0.32),
    });
    y -= BODY_LH;
    page.drawText(`${idx + 1}) 영작 참고 영문: ${s.compositionEnglish}`, {
      x: MARGIN_L,
      y: y - BODY_PT,
      size: BODY_PT * 0.88,
      font: fontReg,
      color: rgb(0.22, 0.25, 0.32),
    });
    y -= BODY_LH * 1.35;
  });

  drawFootersAll();
  return pdfDoc.save();
}
