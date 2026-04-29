import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { SignalLogicAnalysisReportJson } from "@/types/signalLogicAnalysisReport";
import { safeDocxFilenamePart, stripMarkdownBold, triggerDocxDownload } from "@/lib/docx/docxHelpers";

function textPara(text: string, opts?: { size?: number; bold?: boolean; italics?: boolean; after?: number }): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: opts?.size ?? 22, bold: opts?.bold, italics: opts?.italics })],
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
  if (!t) return [textPara("—", { italics: true, size: 20 })];
  return t.split(/\n\n+/).flatMap((block) =>
    block.split("\n").map((line) => textPara(line || " ", { size: 22, after: 80 })),
  );
}

export async function downloadSignalLogicReportDocx(args: {
  passage: string;
  report: SignalLogicAnalysisReportJson;
}): Promise<void> {
  const { passage, report } = args;
  const blocks: Paragraph[] = [];

  blocks.push(textPara("Xtudy-Universe | KSAT 영어 분석 리포트 · Signal Logic", { size: 18, after: 60 }));
  blocks.push(textPara("Binary Logic · One-shot Signals", { size: 18, after: 200 }));

  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "Signal Logic 분석", bold: true, size: 36 })],
      spacing: { after: 200 },
    }),
  );

  blocks.push(h2("원본 지문"));
  blocks.push(...richTextParagraphs(passage.trim() || "—"));

  blocks.push(h2("분석 결과"));
  blocks.push(textPara(`주제문: ${report.topicThesis}`, { bold: true, after: 120 }));
  blocks.push(...richTextParagraphs(report.analysisNarrative || "—"));

  const oneShot = report.oneShotSignalWord?.trim() || report.coreSignalWords[0]?.word || "";
  blocks.push(h2("핵심 시그널"));
  if (oneShot) {
    blocks.push(textPara(`One-Shot Signal: ${oneShot}`, { bold: true, after: 160 }));
  }
  for (const s of report.coreSignalWords) {
    const head = [s.word, s.functionTag, s.role].filter(Boolean).join(" · ");
    blocks.push(textPara(head, { bold: true, after: 80 }));
    if (s.phenomenonKo) {
      blocks.push(textPara("① 현상 제시", { bold: true, size: 20, after: 40 }));
      blocks.push(...richTextParagraphs(s.phenomenonKo));
    }
    if (s.evidenceQuote) {
      blocks.push(textPara("② 근거 문장 (지문 인용)", { bold: true, size: 20, after: 40 }));
      blocks.push(...richTextParagraphs(s.evidenceQuote));
    }
    if (s.explanationKo) {
      blocks.push(textPara("③ 논리적 해설", { bold: true, size: 20, after: 40 }));
      blocks.push(...richTextParagraphs(s.explanationKo));
    }
    if (s.flowKo) {
      blocks.push(textPara("④ 논지 흐름", { bold: true, size: 20, after: 40 }));
      blocks.push(...richTextParagraphs(s.flowKo));
    }
    if (!s.phenomenonKo && !s.evidenceQuote && !s.explanationKo && !s.flowKo) {
      blocks.push(textPara(`${s.word}${s.functionTag ? ` · ${s.functionTag}` : ""} — ${s.role}`, { after: 120 }));
    }
  }

  blocks.push(h2("이분법 대립"));
  for (const b of report.binaryOppositions) {
    blocks.push(textPara(`${b.poleA} ↔ ${b.poleB}`, { bold: true, after: 60 }));
    blocks.push(...richTextParagraphs(b.axisLabel));
    if (b.keySentenceQuote) {
      blocks.push(textPara("핵심 문장 (지문 인용):", { bold: true, size: 20, after: 40 }));
      blocks.push(...richTextParagraphs(b.keySentenceQuote));
    }
    if (b.rationaleKo) {
      blocks.push(textPara("키워드 선정·대조 근거", { bold: true, size: 20, after: 40 }));
      blocks.push(...richTextParagraphs(b.rationaleKo));
    }
    if (b.relationKo) {
      blocks.push(textPara("논리 관계 (A ↔ B)", { bold: true, size: 20, after: 40 }));
      blocks.push(...richTextParagraphs(b.relationKo));
    }
  }

  if (report.signalOneShotNotes?.length) {
    blocks.push(h2("원샷 시그널 노트"));
    for (const n of report.signalOneShotNotes) {
      blocks.push(...richTextParagraphs(n));
    }
  }

  blocks.push(h2("어휘 정리"));
  if (!report.vocabularyItems.length) {
    blocks.push(textPara("—", { italics: true }));
  } else {
    for (const v of report.vocabularyItems) {
      blocks.push(textPara(`${v.term} — ${stripMarkdownBold(v.gloss)}`, { after: 100 }));
    }
  }

  blocks.push(
    new Paragraph({
      children: [new TextRun({ text: "[Xtudy-Universe · 지식 큐레이터]", size: 18, italics: true })],
      spacing: { before: 320 },
    }),
  );

  const doc = new Document({ sections: [{ children: blocks }] });
  const blob = await Packer.toBlob(doc);
  const base = safeDocxFilenamePart(report.topicThesis.slice(0, 60), "SignalLogic");
  triggerDocxDownload(blob, `Xtudy-Universe_SignalLogic_${base}.docx`);
}
