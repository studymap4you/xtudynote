import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { EnglishPassageAnalysis, EnglishVocabPair } from "@/types/englishPassageLab";
import { safeDocxFilenamePart, stripMarkdownBold, triggerDocxDownload } from "@/lib/docx/docxHelpers";

function textPara(text: string, opts?: { size?: number; bold?: boolean; after?: number }): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: opts?.size ?? 22, bold: opts?.bold })],
    spacing: { after: opts?.after ?? 100 },
  });
}

function lines(text: string): Paragraph[] {
  const t = stripMarkdownBold(text).trim();
  if (!t) return [textPara("—", { size: 20 })];
  return t.split("\n").map((line) => textPara(line || " ", { size: 22, after: 65 }));
}

export async function downloadEnglishPassageLabDocx(args: {
  title: string;
  teacherName: string;
  examDate: string;
  layoutLabel: string;
  passage: string;
  vocabulary: EnglishVocabPair[];
  analysis: EnglishPassageAnalysis;
}): Promise<void> {
  const { title, teacherName, examDate, layoutLabel, passage, vocabulary, analysis } = args;
  const blocks: Paragraph[] = [];

  blocks.push(textPara("Xtudy-Universe · English Lab", { size: 18, after: 60 }));
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: title.trim() || "영어 지문 학습", bold: true, size: 36 })],
      spacing: { after: 120 },
    }),
  );
  blocks.push(textPara(`담당: ${teacherName}  |  시행일: ${examDate}  |  레이아웃: ${layoutLabel}`, { size: 20, after: 200 }));

  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "원문", bold: true })],
      spacing: { before: 120, after: 100 },
    }),
  );
  blocks.push(...lines(passage));

  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "A. 영어 → 한글 (어휘)", bold: true })],
      spacing: { before: 180, after: 100 },
    }),
  );
  vocabulary.forEach((v, i) => {
    blocks.push(textPara(`${i + 1}. ${v.word}`, { bold: true, after: 40 }));
  });

  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "B. 한글 → 영어 (어휘)", bold: true })],
      spacing: { before: 180, after: 100 },
    }),
  );
  vocabulary.forEach((v, i) => {
    blocks.push(textPara(`${i + 1}. ${v.meaning}`, { bold: true, after: 40 }));
  });

  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "C. 직독직해 (영문)", bold: true })],
      spacing: { before: 180, after: 100 },
    }),
  );
  analysis.sentences.forEach((s, idx) => {
    blocks.push(textPara(`문항 ${idx + 1}`, { bold: true, after: 50 }));
    blocks.push(...lines(s.english));
  });

  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "D. 영작 (한국어 안내)", bold: true })],
      spacing: { before: 180, after: 100 },
    }),
  );
  analysis.sentences.forEach((s, idx) => {
    blocks.push(textPara(`문항 ${idx + 1}`, { bold: true, after: 50 }));
    blocks.push(...lines(s.compositionKorean || s.koreanFull));
  });

  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "교사용 · 모범 정답", bold: true })],
      spacing: { before: 220, after: 100 },
    }),
  );
  blocks.push(textPara("어휘", { bold: true, after: 60 }));
  vocabulary.forEach((v, i) => {
    blocks.push(textPara(`${i + 1}. ${v.word} — ${v.meaning}`, { after: 70 }));
  });
  analysis.sentences.forEach((s, idx) => {
    blocks.push(textPara(`직독 ${idx + 1}: ${s.koreanFull}`, { after: 60 }));
    blocks.push(textPara(`영작 ${idx + 1}: ${s.english}`, { after: 100 }));
  });

  const doc = new Document({ sections: [{ children: blocks }] });
  const blob = await Packer.toBlob(doc);
  const base = safeDocxFilenamePart(title.trim() || "EnglishLab", "EnglishLab");
  triggerDocxDownload(blob, `Xtudy-Universe_EnglishLab_${base}.docx`);
}
