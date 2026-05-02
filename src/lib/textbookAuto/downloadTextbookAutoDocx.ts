import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { safeDocxFilenamePart, stripMarkdownBold, triggerDocxDownload } from "@/lib/docx/docxHelpers";
import type { TextbookAnswerKeyItem, TextbookUnitContent } from "@/types/textbookAuto";

function textPara(text: string, opts?: { size?: number; bold?: boolean; after?: number }): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        size: opts?.size ?? 22,
        bold: opts?.bold,
      }),
    ],
    spacing: { after: opts?.after ?? 90 },
  });
}

function listBlock(title: string, items: string[]): Paragraph[] {
  const blocks: Paragraph[] = [];
  if (!items.length) return blocks;
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: title, bold: true })],
      spacing: { before: 140, after: 90 },
    }),
  );
  for (const line of items) {
    const t = stripMarkdownBold(line).trim();
    if (!t) continue;
    blocks.push(textPara(`• ${t}`, { size: 22, after: 55 }));
  }
  return blocks;
}

function buildStudentParagraphs(params: {
  bookTitle: string;
  units: { unitIndex: number; unit: TextbookUnitContent }[];
}): Paragraph[] {
  const blocks: Paragraph[] = [];
  blocks.push(textPara("Xtudy-Universe · 교재 자동 생성 · 학생용", { size: 18, after: 50 }));
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: params.bookTitle.trim() || "제목 없음", bold: true, size: 36 })],
      spacing: { after: 140 },
    }),
  );

  const sorted = [...params.units].sort((a, b) => a.unitIndex - b.unitIndex);
  for (const { unitIndex, unit } of sorted) {
    blocks.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [
          new TextRun({ text: `제 ${unitIndex + 1}단원 · ${unit.unitTitle}`, bold: true, size: 30 }),
        ],
        spacing: { before: 180, after: 120 },
      }),
    );
    blocks.push(...listBlock("핵심개념", unit.keyConcepts));
    blocks.push(...listBlock("내용학습", unit.contentStudy));
    blocks.push(...listBlock("핵심요약", unit.coreSummary));
    blocks.push(...listBlock("확인학습", unit.practice));
    blocks.push(...listBlock("단원평가", unit.unitTest));
  }
  return blocks;
}

/** Cloud 패키지 업로드·로컬 내보내기 공용 */
export async function buildTextbookAutoStudentDocxBlob(params: {
  bookTitle: string;
  units: { unitIndex: number; unit: TextbookUnitContent }[];
}): Promise<Blob> {
  const doc = new Document({ sections: [{ children: buildStudentParagraphs(params) }] });
  return Packer.toBlob(doc);
}

export async function downloadTextbookAutoStudentDocx(params: {
  bookTitle: string;
  units: { unitIndex: number; unit: TextbookUnitContent }[];
}): Promise<void> {
  const blob = await buildTextbookAutoStudentDocxBlob(params);
  const base = safeDocxFilenamePart(params.bookTitle.trim(), "textbook");
  triggerDocxDownload(blob, `Xtudy-Universe_Textbook_Student_${base}.docx`);
}

function unitTitleLookup(rows: { unitIndex: number; unitTitle: string }[], unitIndex: number): string {
  return rows.find((u) => u.unitIndex === unitIndex)?.unitTitle ?? "";
}

function buildTeacherParagraphs(params: {
  bookTitle: string;
  unitTitles: { unitIndex: number; unitTitle: string }[];
  items: TextbookAnswerKeyItem[];
}): Paragraph[] {
  const byUnit = new Map<number, TextbookAnswerKeyItem[]>();
  for (const it of params.items) {
    const arr = byUnit.get(it.unitIndex) ?? [];
    arr.push(it);
    byUnit.set(it.unitIndex, arr);
  }
  const unitIndexes = [...byUnit.keys()].sort((a, b) => a - b);

  const blocks: Paragraph[] = [];
  blocks.push(textPara("Xtudy-Universe · 교재 자동 생성 · 교사용 정답·해설", { size: 18, after: 50 }));
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: params.bookTitle.trim() || "제목 없음", bold: true, size: 36 })],
      spacing: { after: 140 },
    }),
  );

  for (const ui of unitIndexes) {
    const ut = unitTitleLookup(params.unitTitles, ui);
    blocks.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: `제 ${ui + 1}단원 · ${ut || "(제목 없음)"}`, bold: true, size: 30 })],
        spacing: { before: 180, after: 100 },
      }),
    );

    const unitItems = (byUnit.get(ui) ?? []).slice();
    const practice = unitItems.filter((x) => x.bucket === "practice").sort((a, b) => a.orderIndex - b.orderIndex);
    const test = unitItems.filter((x) => x.bucket === "unitTest").sort((a, b) => a.orderIndex - b.orderIndex);

    blocks.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "확인학습 — 정답·해설", bold: true })],
        spacing: { before: 100, after: 80 },
      }),
    );
    if (practice.length === 0) {
      blocks.push(
        new Paragraph({
          children: [new TextRun({ text: "(문항 없음)", italics: true, size: 22 })],
          spacing: { after: 80 },
        }),
      );
    } else {
      let n = 1;
      for (const it of practice) {
        blocks.push(textPara(`문항 ${n}`, { bold: true, after: 40 }));
        n++;
        blocks.push(textPara(stripMarkdownBold(it.question), { after: 50 }));
        blocks.push(textPara(`정답: ${stripMarkdownBold(it.answer)}`, { bold: true, after: 50 }));
        for (const b of it.explanationBullets) {
          const t = stripMarkdownBold(b).trim();
          if (t) blocks.push(textPara(`• ${t}`, { after: 45 }));
        }
      }
    }

    blocks.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "단원평가 — 정답·해설", bold: true })],
        spacing: { before: 160, after: 80 },
      }),
    );
    if (test.length === 0) {
      blocks.push(
        new Paragraph({
          children: [new TextRun({ text: "(문항 없음)", italics: true, size: 22 })],
          spacing: { after: 80 },
        }),
      );
    } else {
      let n = 1;
      for (const it of test) {
        blocks.push(textPara(`문항 ${n}`, { bold: true, after: 40 }));
        n++;
        blocks.push(textPara(stripMarkdownBold(it.question), { after: 50 }));
        blocks.push(textPara(`정답: ${stripMarkdownBold(it.answer)}`, { bold: true, after: 50 }));
        for (const b of it.explanationBullets) {
          const t = stripMarkdownBold(b).trim();
          if (t) blocks.push(textPara(`• ${t}`, { after: 45 }));
        }
      }
    }
  }

  return blocks;
}

export async function buildTextbookAutoTeacherDocxBlob(params: {
  bookTitle: string;
  unitTitles: { unitIndex: number; unitTitle: string }[];
  items: TextbookAnswerKeyItem[];
}): Promise<Blob> {
  const doc = new Document({ sections: [{ children: buildTeacherParagraphs(params) }] });
  return Packer.toBlob(doc);
}

export async function downloadTextbookAutoTeacherDocx(params: {
  bookTitle: string;
  unitTitles: { unitIndex: number; unitTitle: string }[];
  items: TextbookAnswerKeyItem[];
}): Promise<void> {
  const blob = await buildTextbookAutoTeacherDocxBlob(params);
  const base = safeDocxFilenamePart(params.bookTitle.trim(), "textbook");
  triggerDocxDownload(blob, `Xtudy-Universe_Textbook_Teacher_${base}.docx`);
}
