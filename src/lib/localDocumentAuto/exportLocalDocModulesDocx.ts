/**
 * 학습지·평가문제지(로컬 모듈) — Word(.docx), 지문 분류 내보내기와 동일 docx 스택
 */
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import {
  LOCAL_DOC_FIELD_LABEL,
  problemModulePrintTitle,
  type LocalDocModule,
  type LocalDocModuleField,
} from "@/lib/localDocumentAuto/manuscriptModules";
import { safeDocxFilenamePart, stripMarkdownBold, triggerDocxDownload } from "@/lib/docx/docxHelpers";

const EVAL_SECTION_TITLE = "평가문제";

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
    spacing: { before: 200, after: 120 },
  });
}

function modulePrintTitle(field: LocalDocModuleField): string {
  return LOCAL_DOC_FIELD_LABEL[field];
}

function splitTwoColumns(text: string): [string, string] {
  const lines = text.split("\n");
  if (lines.length <= 2) {
    const mid = Math.floor(text.length / 2) || 1;
    return [text.slice(0, mid).trim(), text.slice(mid).trim() || " "];
  }
  const mid = Math.ceil(lines.length / 2);
  return [lines.slice(0, mid).join("\n").trim(), lines.slice(mid).join("\n").trim() || " "];
}

export async function downloadLocalDocModulesDocx(params: {
  kind: "worksheet" | "evaluation";
  modules: LocalDocModule[];
  headerTitle: string;
  footerLeft: string;
  footerRight: string;
  docTitle: string;
  fileStem: string;
}): Promise<void> {
  const { kind, modules, headerTitle, footerLeft, footerRight, docTitle, fileStem } = params;
  const blocks: Paragraph[] = [];

  if (headerTitle.trim()) {
    blocks.push(textPara(headerTitle.trim(), { bold: true, size: 24, after: 80 }));
  }
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({
          text: `${docTitle.trim() || "문서"} · ${kind === "worksheet" ? "학습지" : "평가문제지"}`,
          bold: true,
          size: 32,
        }),
      ],
      spacing: { after: 200 },
    }),
  );

  if (kind === "worksheet") {
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
        title = m.field === "preamble" ? "도입 (구획 전)" : modulePrintTitle(m.field);
      }
      blocks.push(h2(title));
      blocks.push(...bodyLines(body, 22));
    }
  } else {
    const evParts = modules.filter((m) => m.field === "evaluation").map((m) => (m.body ?? "").trim()).filter(Boolean);
    const ev = evParts.length ? evParts.join("\n\n") : " ";
    const [left, right] = splitTwoColumns(ev);
    blocks.push(h2(EVAL_SECTION_TITLE));
    blocks.push(textPara("【좌단】", { bold: true, size: 20, after: 50 }));
    blocks.push(...bodyLines(left, 22));
    blocks.push(textPara("【우단】", { bold: true, size: 20, after: 50 }));
    blocks.push(...bodyLines(right, 22));
  }

  if (footerLeft.trim() || footerRight.trim()) {
    blocks.push(
      textPara(`${footerLeft.trim()}  ·  ${footerRight.trim()}`.trim(), {
        size: 18,
        after: 0,
      }),
    );
  }

  const doc = new Document({ sections: [{ children: blocks }] });
  const blob = await Packer.toBlob(doc);
  const base = safeDocxFilenamePart(fileStem.trim() || "local_doc", "local_doc");
  const suffix = kind === "worksheet" ? "worksheet" : "evaluation";
  triggerDocxDownload(blob, `Xtudy-Universe_LocalDoc_${suffix}_${base}.docx`);
}
