import { AlignmentType, Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from "docx";
import { safeDocxFilenamePart, stripMarkdownBold, triggerDocxDownload } from "@/lib/docx/docxHelpers";
import { rasterImageFileToDocxRaster, scaleCoverToMaxWidth } from "@/lib/textbookAuto/imageFileForDocx";
import type {
  TextbookAnswerKeyItem,
  TextbookContentStudyBlock,
  TextbookKeyConceptItem,
  TextbookUnitContent,
  TextbookUnitTestItem,
} from "@/types/textbookAuto";
import { unitForStudentOutput } from "@/lib/textbookAuto/sectionInclusion";
import { manuscriptModulesToStudentDocxParagraphs } from "@/lib/textbookAuto/manuscriptModulesDocx";

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

function sectionHeading(title: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text: title, bold: true })],
    spacing: { before: 140, after: 90 },
  });
}

function keyConceptParagraphs(items: TextbookKeyConceptItem[]): Paragraph[] {
  const blocks: Paragraph[] = [];
  if (!items.length) return blocks;
  blocks.push(sectionHeading("핵심개념"));
  for (const k of items) {
    const c = stripMarkdownBold(k.concept).trim();
    const e = stripMarkdownBold(k.explanation).trim();
    if (!c && !e) continue;
    blocks.push(textPara(`• ${c || "(개념)"}`, { bold: true, after: 45 }));
    if (e) blocks.push(textPara(`  ${e}`, { size: 22, after: 70 }));
  }
  return blocks;
}

function contentStudyParagraphs(sections: TextbookContentStudyBlock[]): Paragraph[] {
  const blocks: Paragraph[] = [];
  if (!sections.length) return blocks;
  blocks.push(sectionHeading("내용학습"));
  for (const sec of sections) {
    const ti = stripMarkdownBold(sec.title).trim();
    if (ti) {
      blocks.push(
        new Paragraph({
          children: [new TextRun({ text: ti, bold: true, size: 24 })],
          spacing: { before: 100, after: 55 },
        }),
      );
    }
    for (const line of sec.bullets) {
      const t = stripMarkdownBold(line).trim();
      if (t) blocks.push(textPara(`• ${t}`, { size: 22, after: 55 }));
    }
  }
  return blocks;
}

function unitTestStudentParagraphs(items: TextbookUnitTestItem[]): Paragraph[] {
  const blocks: Paragraph[] = [];
  if (!items.length) return blocks;
  blocks.push(sectionHeading("단원평가"));
  let n = 1;
  for (const it of items) {
    if (it.kind === "short") {
      const q = stripMarkdownBold(it.question).trim();
      if (!q) continue;
      blocks.push(textPara(`${n}. ${q}`, { size: 22, after: 70 }));
      n++;
      continue;
    }
    const q = stripMarkdownBold(it.question).trim();
    const hasChoice = it.choices.some((c) => stripMarkdownBold(c).trim());
    if (!q && !hasChoice) continue;
    if (q) blocks.push(textPara(`${n}. ${q}`, { size: 22, after: 50 }));
    let ci = 1;
    for (const c of it.choices) {
      const t = stripMarkdownBold(c).trim();
      if (t) {
        blocks.push(textPara(`   ${ci}) ${t}`, { size: 22, after: 45 }));
        ci++;
      }
    }
    n++;
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
  blocks.push(...buildTextbookBodyParagraphsFromUnits(params.units));
  return blocks;
}

function pushUnitBodyParagraphs(
  blocks: Paragraph[],
  unitIndex: number,
  rawUnit: TextbookUnitContent,
): void {
  const unit = unitForStudentOutput(rawUnit);
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({ text: `제 ${unitIndex + 1}단원 · ${unit.unitTitle}`, bold: true, size: 30 }),
      ],
      spacing: { before: 180, after: 120 },
    }),
  );
  if (rawUnit.manuscriptModules?.length) {
    blocks.push(...manuscriptModulesToStudentDocxParagraphs(rawUnit.manuscriptModules));
  }
  blocks.push(...keyConceptParagraphs(unit.keyConcepts));
  blocks.push(...contentStudyParagraphs(unit.contentStudy));
  blocks.push(...listBlock("핵심요약", unit.coreSummary));
  blocks.push(...listBlock("확인학습", unit.practice));
  blocks.push(...unitTestStudentParagraphs(unit.unitTest));
}

/** 5단계 완성본 등 — 앞/뒤표지·목차 없이 단원 본문만 */
export function buildTextbookBodyParagraphsFromUnits(units: { unitIndex: number; unit: TextbookUnitContent }[]): Paragraph[] {
  const blocks: Paragraph[] = [];
  for (const { unitIndex, unit: rawUnit } of units) {
    pushUnitBodyParagraphs(blocks, unitIndex, rawUnit);
  }
  return blocks;
}

/** 단원 시작 커버 이미지(File)를 선행 삽입한 본문 (완성본 Word용) */
export async function buildTextbookBodyParagraphsFromUnitsWithCovers(
  units: { unitIndex: number; unit: TextbookUnitContent }[],
  unitCovers?: Record<number, File | null>,
): Promise<Paragraph[]> {
  const blocks: Paragraph[] = [];
  for (const { unitIndex, unit: rawUnit } of units) {
    const cover = unitCovers?.[unitIndex];
    if (cover) {
      const raster = await rasterImageFileToDocxRaster(cover);
      const dim = scaleCoverToMaxWidth(raster);
      blocks.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              type: raster.type,
              data: raster.data,
              transformation: { width: dim.width, height: dim.height },
            }),
          ],
          spacing: { before: 120, after: 120 },
        }),
      );
    }
    pushUnitBodyParagraphs(blocks, unitIndex, rawUnit);
  }
  return blocks;
}

export function buildTextbookBodyParagraphsFromPassages(unitPassages: string[]): Paragraph[] {
  const blocks: Paragraph[] = [];
  unitPassages.forEach((raw, i) => {
    blocks.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: `제 ${i + 1}단원 · 원문`, bold: true, size: 30 })],
        spacing: { before: 180, after: 120 },
      }),
    );
    const lines = raw.replace(/\r\n/g, "\n").split("\n");
    for (const line of lines) {
      blocks.push(textPara(line.length ? line : " ", { size: 22, after: 55 }));
    }
  });
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
