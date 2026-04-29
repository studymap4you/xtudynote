import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { safeDocxFilenamePart, stripMarkdownBold, triggerDocxDownload } from "@/lib/docx/docxHelpers";

export type WorksheetDocxFormPayload = {
  unit: string;
  objectives: string;
  studyDate: string;
  content: string;
  exercises: string;
  summary: string;
  teacherName: string;
  exerciseAnswers?: string;
};

function textPara(text: string, opts?: { size?: number; bold?: boolean; italics?: boolean; after?: number }): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        size: opts?.size ?? 22,
        bold: opts?.bold,
        italics: opts?.italics,
      }),
    ],
    spacing: { after: opts?.after ?? 100 },
  });
}

function sectionBody(text: string): Paragraph[] {
  const t = stripMarkdownBold(text).trim();
  if (!t) {
    return [
      new Paragraph({
        children: [new TextRun({ text: "(비어 있음)", italics: true, size: 22 })],
        spacing: { after: 80 },
      }),
    ];
  }
  return t.split("\n").map((line) => textPara(line || " ", { size: 22, after: 70 }));
}

export async function downloadWorksheetFormDocx(payload: WorksheetDocxFormPayload): Promise<void> {
  const blocks: Paragraph[] = [];

  blocks.push(textPara("Xtudy-Universe · Worksheet", { size: 18, after: 60 }));
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "학습지", bold: true, size: 36 })],
      spacing: { after: 120 },
    }),
  );

  blocks.push(textPara(`학습단원: ${payload.unit}`, { bold: true, after: 80 }));
  blocks.push(textPara(`선생님: ${payload.teacherName}`, { after: 80 }));
  blocks.push(textPara(`학습일자: ${payload.studyDate || "—"}`, { after: 160 }));

  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "학습목표", bold: true })],
      spacing: { before: 120, after: 100 },
    }),
  );
  blocks.push(...sectionBody(payload.objectives));

  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "학습내용", bold: true })],
      spacing: { before: 160, after: 100 },
    }),
  );
  blocks.push(...sectionBody(payload.content));

  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "확인문제", bold: true })],
      spacing: { before: 160, after: 100 },
    }),
  );
  blocks.push(...sectionBody(payload.exercises));

  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "핵심요약", bold: true })],
      spacing: { before: 160, after: 100 },
    }),
  );
  blocks.push(...sectionBody(payload.summary));

  const ans = payload.exerciseAnswers?.trim();
  if (ans) {
    blocks.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "교사용 · 확인문제 참고 정답", bold: true })],
        spacing: { before: 200, after: 100 },
      }),
    );
    blocks.push(...sectionBody(ans));
  }

  const doc = new Document({ sections: [{ children: blocks }] });
  const blob = await Packer.toBlob(doc);
  const base = safeDocxFilenamePart(payload.unit, "worksheet");
  triggerDocxDownload(blob, `Xtudy-Universe_Worksheet_${base}.docx`);
}
