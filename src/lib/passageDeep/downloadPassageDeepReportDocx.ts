import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { PassageDeepAnalysisReportJson } from "@/types/passageDeepAnalysisReport";
import { safeDocxFilenamePart, stripMarkdownBold, triggerDocxDownload } from "@/lib/docx/docxHelpers";

function textPara(text: string, opts?: { size?: number; bold?: boolean; after?: number }): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: opts?.size ?? 22, bold: opts?.bold })],
    spacing: { after: opts?.after ?? 100 },
  });
}

function h2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, bold: true })],
    spacing: { before: 220, after: 120 },
  });
}

function richTextParagraphs(text: string): Paragraph[] {
  const t = stripMarkdownBold(text).trim();
  if (!t) return [textPara("—", { size: 20 })];
  return t.split(/\n/).map((line) => textPara(line || " ", { size: 22, after: 70 }));
}

function bilingualParas(label: string, english: string, korean: string): Paragraph[] {
  return [
    textPara(label, { bold: true, size: 20, after: 50 }),
    ...richTextParagraphs(english),
    ...richTextParagraphs(korean),
  ];
}

export async function downloadPassageDeepReportDocx(args: {
  passage: string;
  report: PassageDeepAnalysisReportJson;
}): Promise<void> {
  const { passage, report } = args;
  const blocks: Paragraph[] = [];

  blocks.push(textPara("Xtudy-Universe | 지문 심층 분석", { size: 18, after: 60 }));
  blocks.push(textPara("문장 단위 · 의미 단위(/) · 직독·해석·어휘·문법", { size: 18, after: 200 }));

  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "지문 심층 분석", bold: true, size: 36 })],
      spacing: { after: 200 },
    }),
  );

  blocks.push(h2("원본 지문"));
  blocks.push(...richTextParagraphs(passage.trim() || "—"));

  blocks.push(h2("주제 · 제목"));
  blocks.push(...bilingualParas("1. 주제", report.theme.english, report.theme.koreanExplanation));
  blocks.push(...bilingualParas("2. 제목", report.passageTitle.english, report.passageTitle.koreanExplanation));

  blocks.push(h2("3. 지문 심층 분석 (문장별)"));
  for (const s of report.sentences) {
    blocks.push(textPara(`문장 ${s.sentenceIndex}`, { bold: true, after: 60 }));
    blocks.push(...richTextParagraphs(s.sentenceEnglish));
    blocks.push(textPara("의미 단위 (영문)", { bold: true, size: 20, after: 40 }));
    blocks.push(textPara(s.meaningUnits.length ? s.meaningUnits.join(" / ") : "—", { after: 100 }));
    blocks.push(textPara("직독직해 (한국어)", { bold: true, size: 20, after: 40 }));
    blocks.push(
      textPara(s.literalTranslationUnits.length ? s.literalTranslationUnits.join(" / ") : "—", {
        after: 100,
      }),
    );
    blocks.push(textPara("전문 해석", { bold: true, size: 20, after: 40 }));
    blocks.push(...richTextParagraphs(s.professionalInterpretation || "—"));
    blocks.push(textPara("주요 어휘·표현", { bold: true, size: 20, after: 40 }));
    for (const v of s.keyVocabItems) {
      blocks.push(textPara(`${v.english} : ${v.koreanExplanation}`, { after: 80 }));
    }
  }

  blocks.push(h2("4. 핵심 표현 정리"));
  for (const item of report.keyExpressionsList) {
    blocks.push(textPara(`${item.english} : ${item.koreanExplanation}`, { after: 80 }));
  }

  blocks.push(h2("5. 핵심 문법·구문"));
  for (const item of report.keyGrammarSyntaxList) {
    blocks.push(textPara(`${item.english} : ${item.koreanExplanation}`, { after: 80 }));
  }

  blocks.push(
    new Paragraph({
      children: [new TextRun({ text: "[Xtudy-Universe · 지식 큐레이터]", size: 18, italics: true })],
      spacing: { before: 320 },
    }),
  );

  const doc = new Document({ sections: [{ children: blocks }] });
  const blob = await Packer.toBlob(doc);
  const base = safeDocxFilenamePart(
    `${report.passageTitle.english}`.slice(0, 50) || "PassageDeep",
    "PassageDeep",
  );
  triggerDocxDownload(blob, `Xtudy-Universe_PassageDeep_${base}.docx`);
}
