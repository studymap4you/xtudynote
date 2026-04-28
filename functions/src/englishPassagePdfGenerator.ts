import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, type PDFPage, type PDFFont, rgb, type PDFImage } from "pdf-lib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MM = 2.83465;
const PAGE_W = 595.28;
const PAGE_H = 841.89;

/**
 * 상하좌우 25mm (pdf-lib 좌표계). Puppeteer 미사용 — 레이아웃·분페이지는 본 파일에서 계산.
 */
const MARGIN_L = 25 * MM;
const MARGIN_R = 25 * MM;
const MARGIN_TOP = 25 * MM;
const MARGIN_BOT = 25 * MM;

const BODY_PT = 9.5;
const BODY_LH = BODY_PT * 1.45;
const H2_PT = 11;
const TITLE_PT = 14;
const HEADER_BRAND_PT = 8;
const FOOTER_SMALL = 7;

export type EnglishPassagePdfLayout = "1col" | "2col";

export type EnglishPassagePdfSentence = {
  english: string;
  koreanFull: string;
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

  /** 바닥글·페이지번호 영역 위로 본문이 올라오지 않게 여유 */
  const footerBand = 28;
  const minY = MARGIN_BOT + footerBand + 14;
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

  /** 한 줄(또는 한 단위) 그리기 직전 — 페이지 끝에서 잘리지 않도록 */
  const ensureLine = (lh: number): void => {
    if (y - lh < minY) {
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
    for (const ln of lines) {
      ensureLine(lh + 4);
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

  drawHeading("원문 지문");
  drawParagraph("", passage.slice(0, 9000) || "(없음)");

  const vocab = input.vocabulary ?? [];
  const sentences = input.sentences ?? [];

  const TWO_COL_GUTTER = 12;
  const ruleGray = rgb(0.55, 0.58, 0.62);
  const inkRule = rgb(0.12, 0.18, 0.22);

  if (layout === "2col") {
    ensureSpace(16);
    page.drawRectangle({
      x: MARGIN_L,
      y: y - 10,
      width: contentWidth,
      height: 1.2,
      color: inkRule,
    });
    y -= 18;

    const colW = (contentWidth - TWO_COL_GUTTER) / 2;
    const xL = MARGIN_L;
    const xR = MARGIN_L + colW + TWO_COL_GUTTER;
    const lineXM = MARGIN_L + colW + TWO_COL_GUTTER / 2;

    type TcState = { pg: PDFPage; yL: number; yR: number; topY: number };
    const tc: TcState = { pg: page, yL: y, yR: y, topY: y };

    const drawVertOnPage = (pg: PDFPage, topY: number): void => {
      pg.drawLine({
        start: { x: lineXM, y: minY },
        end: { x: lineXM, y: topY },
        thickness: 0.65,
        color: ruleGray,
      });
    };

    const tcGetY = (side: "L" | "R"): number => (side === "L" ? tc.yL : tc.yR);
    const tcSetY = (side: "L" | "R", v: number): void => {
      if (side === "L") tc.yL = v;
      else tc.yR = v;
    };

    const tcNewPage = (): void => {
      drawVertOnPage(tc.pg, tc.topY);
      const n = openPage();
      tc.pg = n.pg;
      page = n.pg;
      tc.yL = tc.yR = n.y;
      tc.topY = n.y;
    };

    /** 2열: 줄 단위로만 페이지 넘김 — 블록 전체가 한 페이지보다 크면 여러 페이지에 이어서 그림 */
    const tcEnsureLine = (side: "L" | "R", lh: number): void => {
      if (tcGetY(side) - lh >= minY) return;
      tcNewPage();
    };

    const tcPickPreferBalanced = (): "L" | "R" => (tc.yL >= tc.yR ? "L" : "R");

    const tcDrawHeading = (text: string): void => {
      const side = tcPickPreferBalanced();
      const xb = side === "L" ? xL : xR;
      const headLines = wrapLines(text, fontBold, H2_PT, colW);
      for (const ln of headLines) {
        tcEnsureLine(side, H2_PT + 8);
        const yy = tcGetY(side);
        tc.pg.drawText(ln, {
          x: xb,
          y: yy - H2_PT,
          size: H2_PT,
          font: fontBold,
          color: blue,
        });
        tcSetY(side, yy - H2_PT - 6);
      }
      tcSetY(side, tcGetY(side) - 4);
    };

    const tcDrawMuted = (text: string): void => {
      const fs = BODY_PT * 0.88;
      const side = tcPickPreferBalanced();
      const xb = side === "L" ? xL : xR;
      tcEnsureLine(side, BODY_LH + 4);
      const yy = tcGetY(side);
      tc.pg.drawText(text, {
        x: xb,
        y: yy - fs,
        size: fs,
        font: fontReg,
        color: muted,
      });
      tcSetY(side, yy - BODY_LH);
    };

    const tcDrawParagraph = (label: string, body: string): void => {
      const lines = wrapLines(`${label}${body}`, fontReg, BODY_PT, colW - 2);
      const side = tcPickPreferBalanced();
      const xb = side === "L" ? xL : xR;
      for (const ln of lines) {
        tcEnsureLine(side, BODY_LH + 4);
        const yy = tcGetY(side);
        tc.pg.drawText(ln || " ", {
          x: xb,
          y: yy - BODY_PT,
          size: BODY_PT,
          font: fontReg,
          color: rgb(0.15, 0.18, 0.22),
        });
        tcSetY(side, yy - BODY_LH);
      }
      tcSetY(side, tcGetY(side) - 6);
    };

    const tcVocabBoxes = (lineFor: (idx: number) => string, mutedHint: string, heading: string): void => {
      tcDrawHeading(heading);
      tcDrawMuted(mutedHint);
      vocab.forEach((_v, idx) => {
        const line = lineFor(idx);
        const lines = wrapLines(line, fontReg, BODY_PT, colW - 4);
        const boxH = 28;
        const side = tcPickPreferBalanced();
        const xb = side === "L" ? xL : xR;
        for (const ln of lines) {
          tcEnsureLine(side, BODY_LH + 4);
          const yy = tcGetY(side);
          tc.pg.drawText(ln, {
            x: xb,
            y: yy - BODY_PT,
            size: BODY_PT,
            font: fontReg,
            color: rgb(0.12, 0.14, 0.18),
          });
          tcSetY(side, yy - BODY_LH);
        }
        tcSetY(side, tcGetY(side) - 4);
        tcEnsureLine(side, boxH + 10);
        let yy = tcGetY(side);
        tc.pg.drawRectangle({
          x: xb,
          y: yy - boxH,
          width: colW,
          height: boxH,
          borderColor: rgb(0.82, 0.85, 0.88),
          borderWidth: 0.45,
        });
        tcSetY(side, yy - boxH - 8);
      });
    };

    tcVocabBoxes(
      (idx) => `${idx + 1}. ${vocab[idx]!.word}`,
      "(문항 번호에 맞추어 한글 뜻을 작성하세요.)",
      "A. 어휘 — 영어 단어 → 한글 뜻",
    );
    tcVocabBoxes(
      (idx) => `${idx + 1}. ${vocab[idx]!.meaning}`,
      "(문항 번호에 맞추어 영어 단어를 작성하세요.)",
      "B. 어휘 — 한글 뜻 → 영어 단어",
    );

    tcDrawHeading("C. 직독직해 (영문 → 한국어 해석 전체)");
    sentences.forEach((s, idx) => {
      const head = `${idx + 1}. 아래 영문을 한국어로 옮겨 쓰세요.`;
      const headLines = wrapLines(head, fontBold, BODY_PT, colW);
      const enc = wrapLines(s.english, fontReg, BODY_PT * 0.92, colW);
      const answerH = 64;
      const side = tcPickPreferBalanced();
      const xb = side === "L" ? xL : xR;
      const lhHead = BODY_LH * 1.05;
      const lhEnc = BODY_LH * 0.95;
      for (const ln of headLines) {
        tcEnsureLine(side, lhHead + 4);
        const yy = tcGetY(side);
        tc.pg.drawText(ln, {
          x: xb,
          y: yy - BODY_PT,
          size: BODY_PT,
          font: fontBold,
          color: rgb(0.12, 0.14, 0.18),
        });
        tcSetY(side, yy - lhHead);
      }
      for (const ln of enc) {
        tcEnsureLine(side, lhEnc + 4);
        const yy = tcGetY(side);
        tc.pg.drawText(ln, {
          x: xb,
          y: yy - BODY_PT * 0.92,
          size: BODY_PT * 0.92,
          font: fontReg,
          color: rgb(0.25, 0.28, 0.32),
        });
        tcSetY(side, yy - lhEnc);
      }
      tcSetY(side, tcGetY(side) - 4);
      tcEnsureLine(side, answerH + 12);
      let yy = tcGetY(side);
      tc.pg.drawRectangle({
        x: xb,
        y: yy - answerH,
        width: colW,
        height: answerH,
        borderColor: rgb(0.82, 0.85, 0.88),
        borderWidth: 0.5,
      });
      tcSetY(side, yy - answerH - 12);
    });

    tcDrawHeading("D. 영작 (한국어 해석 → 영문 전체)");
    sentences.forEach((s, idx) => {
      const head = `${idx + 1}. 아래 한국어를 영어 문장으로 옮겨 쓰세요.`;
      const headLines = wrapLines(head, fontBold, BODY_PT, colW);
      const ko = wrapLines(s.koreanFull, fontReg, BODY_PT * 0.92, colW);
      const ah = 58;
      const side = tcPickPreferBalanced();
      const xb = side === "L" ? xL : xR;
      const lhHead = BODY_LH * 1.05;
      const lhKo = BODY_LH * 0.95;
      for (const ln of headLines) {
        tcEnsureLine(side, lhHead + 4);
        const yy = tcGetY(side);
        tc.pg.drawText(ln, {
          x: xb,
          y: yy - BODY_PT,
          size: BODY_PT,
          font: fontBold,
          color: rgb(0.12, 0.14, 0.18),
        });
        tcSetY(side, yy - lhHead);
      }
      for (const ln of ko) {
        tcEnsureLine(side, lhKo + 4);
        const yy = tcGetY(side);
        tc.pg.drawText(ln, {
          x: xb,
          y: yy - BODY_PT * 0.92,
          size: BODY_PT * 0.92,
          font: fontReg,
          color: rgb(0.18, 0.2, 0.24),
        });
        tcSetY(side, yy - lhKo);
      }
      tcSetY(side, tcGetY(side) - 4);
      tcEnsureLine(side, ah + 12);
      const yy = tcGetY(side);
      tc.pg.drawRectangle({
        x: xb,
        y: yy - ah,
        width: colW,
        height: ah,
        borderColor: rgb(0.82, 0.85, 0.88),
        borderWidth: 0.5,
      });
      tcSetY(side, yy - ah - 12);
    });

    tcDrawHeading("교사용 · 모범 정답");
    vocab.forEach((v, idx) => {
      tcDrawParagraph(`${idx + 1}. `, `${v.word} — ${v.meaning}`);
    });
    sentences.forEach((s, idx) => {
      tcDrawParagraph(`[직독 ${idx + 1}] 한국어: `, s.koreanFull);
      tcDrawParagraph(`[영작 ${idx + 1}] 영어: `, s.english);
    });

    drawVertOnPage(tc.pg, tc.topY);
    page = tc.pg;
    y = Math.min(tc.yL, tc.yR);
  } else {
    drawHeading("A. 어휘 — 영어 단어 → 한글 뜻");
    page.drawText("(문항 번호에 맞추어 한글 뜻을 작성하세요.)", {
      x: MARGIN_L,
      y: y - BODY_PT * 0.88,
      size: BODY_PT * 0.88,
      font: fontReg,
      color: muted,
    });
    y -= BODY_LH;
    vocab.forEach((v, idx) => {
      const line = `${idx + 1}. ${v.word}`;
      const lines = wrapLines(line, fontReg, BODY_PT, contentWidth - 4);
      for (const ln of lines) {
        ensureLine(BODY_LH + 6);
        page.drawText(ln, {
          x: MARGIN_L,
          y: y - BODY_PT,
          size: BODY_PT,
          font: fontReg,
          color: rgb(0.12, 0.14, 0.18),
        });
        y -= BODY_LH;
      }
      ensureLine(36);
      page.drawRectangle({
        x: MARGIN_L,
        y: y - 28,
        width: contentWidth,
        height: 28,
        borderColor: rgb(0.82, 0.85, 0.88),
        borderWidth: 0.45,
      });
      y -= 36;
    });

    drawHeading("B. 어휘 — 한글 뜻 → 영어 단어");
    page.drawText("(문항 번호에 맞추어 영어 단어를 작성하세요.)", {
      x: MARGIN_L,
      y: y - BODY_PT * 0.88,
      size: BODY_PT * 0.88,
      font: fontReg,
      color: muted,
    });
    y -= BODY_LH;
    vocab.forEach((v, idx) => {
      const line = `${idx + 1}. ${v.meaning}`;
      const lines = wrapLines(line, fontReg, BODY_PT, contentWidth - 4);
      for (const ln of lines) {
        ensureLine(BODY_LH + 6);
        page.drawText(ln, {
          x: MARGIN_L,
          y: y - BODY_PT,
          size: BODY_PT,
          font: fontReg,
          color: rgb(0.12, 0.14, 0.18),
        });
        y -= BODY_LH;
      }
      ensureLine(36);
      page.drawRectangle({
        x: MARGIN_L,
        y: y - 28,
        width: contentWidth,
        height: 28,
        borderColor: rgb(0.82, 0.85, 0.88),
        borderWidth: 0.45,
      });
      y -= 36;
    });

    drawHeading("C. 직독직해 (영문 → 한국어 해석 전체)");
    sentences.forEach((s, idx) => {
      ensureLine(BODY_LH * 3);
      page.drawText(`${idx + 1}. 아래 영문을 한국어로 옮겨 쓰세요.`, {
        x: MARGIN_L,
        y: y - BODY_PT,
        size: BODY_PT,
        font: fontBold,
        color: rgb(0.12, 0.14, 0.18),
      });
      y -= BODY_LH * 1.2;
      const enc = wrapLines(s.english, fontReg, BODY_PT * 0.92, contentWidth);
      for (const ln of enc) {
        ensureLine(BODY_LH);
        page.drawText(ln, {
          x: MARGIN_L,
          y: y - BODY_PT * 0.92,
          size: BODY_PT * 0.92,
          font: fontReg,
          color: rgb(0.25, 0.28, 0.32),
        });
        y -= BODY_LH * 0.95;
      }
      const answerH = 64;
      ensureLine(answerH + 8);
      page.drawRectangle({
        x: MARGIN_L,
        y: y - answerH,
        width: contentWidth,
        height: answerH,
        borderColor: rgb(0.82, 0.85, 0.88),
        borderWidth: 0.5,
      });
      y -= answerH + 14;
    });

    drawHeading("D. 영작 (한국어 해석 → 영문 전체)");
    sentences.forEach((s, idx) => {
      ensureLine(BODY_LH * 4);
      page.drawText(`${idx + 1}. 아래 한국어를 영어 문장으로 옮겨 쓰세요.`, {
        x: MARGIN_L,
        y: y - BODY_PT,
        size: BODY_PT,
        font: fontBold,
        color: rgb(0.12, 0.14, 0.18),
      });
      y -= BODY_LH * 1.2;
      const ko = wrapLines(s.koreanFull, fontReg, BODY_PT * 0.92, contentWidth);
      for (const ln of ko) {
        ensureLine(BODY_LH);
        page.drawText(ln, {
          x: MARGIN_L,
          y: y - BODY_PT * 0.92,
          size: BODY_PT * 0.92,
          font: fontReg,
          color: rgb(0.18, 0.2, 0.24),
        });
        y -= BODY_LH * 0.95;
      }
      const ah = 58;
      ensureLine(ah + 8);
      page.drawRectangle({
        x: MARGIN_L,
        y: y - ah,
        width: contentWidth,
        height: ah,
        borderColor: rgb(0.82, 0.85, 0.88),
        borderWidth: 0.5,
      });
      y -= ah + 14;
    });

    drawHeading("교사용 · 모범 정답");
    vocab.forEach((v, idx) => {
      drawParagraph(`${idx + 1}. `, `${v.word} — ${v.meaning}`);
    });
    sentences.forEach((s, idx) => {
      drawParagraph(`[직독 ${idx + 1}] 한국어: `, s.koreanFull);
      drawParagraph(`[영작 ${idx + 1}] 영어: `, s.english);
    });
  }

  drawFootersAll();
  return pdfDoc.save();
}
