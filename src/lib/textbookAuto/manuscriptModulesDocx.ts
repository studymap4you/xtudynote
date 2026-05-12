import { HeadingLevel, Paragraph, TextRun } from "docx";
import {
  LOCAL_DOC_FIELD_LABEL,
  problemModulePrintTitle,
  type LocalDocModule,
  type LocalDocModuleField,
} from "@/lib/localDocumentAuto/manuscriptModules";
import { stripMarkdownBold } from "@/lib/docx/docxHelpers";

function bodyLines(text: string, size = 22): Paragraph[] {
  const t = stripMarkdownBold(text ?? "").trim();
  if (!t) return [];
  return t.split(/\n/).map(
    (line) =>
      new Paragraph({
        children: [new TextRun({ text: line || " ", size })],
        spacing: { after: 65 },
      }),
  );
}

function moduleTitle(field: LocalDocModuleField): string {
  return LOCAL_DOC_FIELD_LABEL[field];
}

/** 학습지와 동일 규칙: evaluation 블록 제외, 문제 블록은 문항 표시 제목 */
export function manuscriptModulesToStudentDocxParagraphs(modules: LocalDocModule[]): Paragraph[] {
  const blocks: Paragraph[] = [];
  let problemOrdinal = 0;
  for (const m of modules) {
    if (m.field === "evaluation") continue;
    const body = (m.body ?? "").trim();
    if (!body) continue;
    let title: string;
    if (m.field === "problem") {
      problemOrdinal += 1;
      title = problemModulePrintTitle(m, problemOrdinal);
    } else {
      title = m.field === "preamble" ? "도입 (구획 전)" : moduleTitle(m.field);
    }
    blocks.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: title, bold: true })],
        spacing: { before: 120, after: 80 },
      }),
    );
    blocks.push(...bodyLines(body, 22));
  }
  return blocks;
}
