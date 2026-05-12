/**
 * 지문 분류 최종 산출물 — PDF(브라우저) · Word(.docx)
 */
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { PassageUnit } from "@/lib/passageClassification/processor";
import { safeDocxFilenamePart, stripMarkdownBold, triggerDocxDownload } from "@/lib/docx/docxHelpers";
import { renderHtmlToA4PdfBlob } from "@/lib/localDocumentAuto/renderClientPdf";

const CH = ["①", "②", "③", "④", "⑤"];

function answerCircle(n: number): string {
  return n >= 1 && n <= 5 ? CH[n - 1]! : `${n}번`;
}

function textPara(text: string, opts?: { size?: number; bold?: boolean; after?: number }): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: opts?.size ?? 22, bold: opts?.bold })],
    spacing: { after: opts?.after ?? 100 },
  });
}

function bodyLines(text: string, size = 22): Paragraph[] {
  const t = stripMarkdownBold(text ?? "").trim();
  if (!t) return [];
  return t.split(/\n/).map(
    (line) =>
      new Paragraph({
        children: [new TextRun({ text: line || " ", size })],
        spacing: { after: 70 },
      }),
  );
}

function h2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, bold: true })],
    spacing: { before: 240, after: 120 },
  });
}

function buildDocxParagraphs(
  units: PassageUnit[],
  meta: { title: string; headerTitle: string; footerLeft: string; footerRight: string },
): Paragraph[] {
  const blocks: Paragraph[] = [];

  if (meta.headerTitle.trim()) {
    blocks.push(textPara(meta.headerTitle.trim(), { bold: true, size: 24, after: 80 }));
  }
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: meta.title.trim() || "지문 분류 결과", bold: true, size: 36 })],
      spacing: { after: 200 },
    }),
  );

  for (const u of units) {
    blocks.push(h2(`[문제 ${u.number}]`));
    const p1 = u.phase1;
    if (p1.stem?.trim()) blocks.push(...bodyLines(p1.stem, 24));
    if (p1.passage?.trim()) blocks.push(...bodyLines(p1.passage, 22));

    const keys = Object.keys(p1.choices).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    for (const k of keys) {
      const i = parseInt(k, 10);
      const mark = i >= 1 && i <= 5 ? CH[i - 1]! : k;
      const line = `${mark} ${p1.choices[k] ?? ""}`.trim();
      blocks.push(textPara(line, { size: 22, after: 60 }));
    }

    if (u.phase2) {
      blocks.push(textPara("[정답]", { bold: true, size: 22, after: 40 }));
      blocks.push(textPara(answerCircle(u.phase2.answer), { bold: true, size: 24, after: 80 }));
      if ((u.phase2.explanation ?? "").trim()) {
        blocks.push(textPara("[지문해설]", { bold: true, size: 22, after: 40 }));
        blocks.push(...bodyLines(u.phase2.explanation ?? "", 22));
      }
    }

    if (u.phase3) {
      if ((u.phase3.topic ?? "").trim()) {
        blocks.push(textPara("[주제]", { bold: true, size: 20, after: 40 }));
        blocks.push(...bodyLines(u.phase3.topic ?? "", 22));
      }
      if ((u.phase3.gist ?? "").trim()) {
        blocks.push(textPara("[요지]", { bold: true, size: 20, after: 40 }));
        blocks.push(...bodyLines(u.phase3.gist ?? "", 22));
      }
      if ((u.phase3.key_sentence ?? "").trim()) {
        blocks.push(textPara("[주제문]", { bold: true, size: 20, after: 40 }));
        blocks.push(...bodyLines(u.phase3.key_sentence ?? "", 22));
      }
      if ((u.phase3.literal ?? "").trim()) {
        blocks.push(textPara("[직독직해]", { bold: true, size: 20, after: 40 }));
        blocks.push(...bodyLines(u.phase3.literal ?? "", 22));
      }
    }

    if (u.phase4?.body?.trim()) {
      blocks.push(textPara("[확인문제]", { bold: true, size: 20, after: 40 }));
      blocks.push(...bodyLines(u.phase4.body, 22));
    }
  }

  if (meta.footerLeft.trim() || meta.footerRight.trim()) {
    blocks.push(
      textPara(`${meta.footerLeft.trim()}  ·  ${meta.footerRight.trim()}`.trim(), {
        size: 18,
        after: 0,
      }),
    );
  }

  return blocks;
}

export async function downloadPassageClassifyDocx(
  units: PassageUnit[],
  meta: { title: string; headerTitle: string; footerLeft: string; footerRight: string },
): Promise<void> {
  const children = buildDocxParagraphs(units, meta);
  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  const base = safeDocxFilenamePart(meta.title.trim() || "PassageClassify", "PassageClassify");
  triggerDocxDownload(blob, `Xtudy-Universe_PassageClassify_${base}.docx`);
}

/** renderPassageDocumentHtml 로 만든 전체 HTML 문자열 → A4 PDF Blob */
export async function buildPassageReportPdfBlob(fullHtml: string): Promise<Blob> {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(fullHtml, "text/html");
  const wrap = document.createElement("div");
  wrap.style.maxWidth = "900px";
  wrap.style.margin = "0 auto";
  wrap.style.background = "#ffffff";
  wrap.style.color = "#0f172a";
  wrap.style.fontFamily = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  wrap.style.lineHeight = "1.6";
  wrap.style.fontSize = "11pt";
  while (parsed.body.firstChild) {
    wrap.appendChild(parsed.body.firstChild);
  }
  return renderHtmlToA4PdfBlob(wrap);
}

export function downloadPassageReportPdfBlob(blob: Blob, title: string): void {
  const base = safeDocxFilenamePart(title.trim() || "PassageClassify", "PassageClassify");
  const name = `Xtudy-Universe_PassageClassify_${base}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[/\\?%*:|"<>]/g, "_");
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
