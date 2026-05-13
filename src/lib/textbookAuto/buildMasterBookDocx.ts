import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { safeDocxFilenamePart, triggerDocxDownload } from "@/lib/docx/docxHelpers";
import type { MasterBookFolioBlock } from "@/lib/textbookAuto/masterBookFolio";
import { rasterImageFileToDocxRaster, scaleCoverToMaxWidth, fetchUrlToRasterImageDocx } from "@/lib/textbookAuto/imageFileForDocx";

export async function folioBlocksToDocxParagraphs(blocks: MasterBookFolioBlock[]): Promise<Paragraph[]> {
  const out: Paragraph[] = [];
  for (const b of blocks) {
    if (b.kind === "text") {
      const lines = b.text.replace(/\r\n/g, "\n").split("\n");
      for (const line of lines) {
        out.push(
          new Paragraph({
            children: [new TextRun({ text: line.length ? line : " ", size: 24 })],
            spacing: { after: 55 },
          }),
        );
      }
    } else if (b.kind === "image") {
      let raster: Awaited<ReturnType<typeof rasterImageFileToDocxRaster>> | null = null;
      if (b.file) {
        raster = await rasterImageFileToDocxRaster(b.file);
      } else if (b.remoteUrl) {
        try {
          raster = await fetchUrlToRasterImageDocx(b.remoteUrl);
        } catch {
          out.push(
            new Paragraph({
              children: [new TextRun({ text: "(이미지를 불러올 수 없습니다.)", italics: true, size: 22 })],
              spacing: { after: 80 },
            }),
          );
        }
      }
      if (raster) {
        const dim = scaleCoverToMaxWidth(raster);
        out.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                type: raster.type,
                data: raster.data,
                transformation: { width: dim.width, height: dim.height },
              }),
            ],
            spacing: { after: 120 },
          }),
        );
      }
    }
  }
  return out;
}

export async function buildMasterBookDocxBlob(params: {
  bookTitle: string;
  frontCover: File | null;
  backCover: File | null;
  tocLines: string[];
  forewordParagraphs?: Paragraph[];
  afterwordParagraphs?: Paragraph[];
  bodyParagraphs: Paragraph[];
  appendixParagraphs: Paragraph[];
}): Promise<Blob> {
  const children: Paragraph[] = [];

  if (params.frontCover) {
    const raster = await rasterImageFileToDocxRaster(params.frontCover);
    const dim = scaleCoverToMaxWidth(raster);
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: raster.type,
            data: raster.data,
            transformation: { width: dim.width, height: dim.height },
          }),
        ],
        spacing: { after: 200 },
      }),
    );
  }

  children.push(
    new Paragraph({
      pageBreakBefore: !!params.frontCover,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: params.bookTitle.trim() || "제목 없음", bold: true, size: 56 })],
      keepNext: true,
      spacing: { before: 200, after: 400 },
    }),
  );

  if (params.forewordParagraphs && params.forewordParagraphs.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "머리말", bold: true, size: 36 })],
        spacing: { before: 120, after: 120 },
      }),
    );
    for (const p of params.forewordParagraphs) children.push(p);
  }

  children.push(
    new Paragraph({
      pageBreakBefore: true,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "목차", bold: true, size: 36 })],
      spacing: { after: 160 },
    }),
  );

  if (params.tocLines.length === 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "(목차 항목이 없습니다. 자동·파일·직접 입력 중 하나를 채워 주세요.)", italics: true, size: 22 })],
        spacing: { after: 80 },
      }),
    );
  } else {
    for (const line of params.tocLines) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: line, size: 24 })],
          spacing: { after: 50 },
        }),
      );
    }
  }

  children.push(
    new Paragraph({
      pageBreakBefore: true,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "본문", bold: true, size: 36 })],
      spacing: { after: 120 },
    }),
  );

  if (params.bodyParagraphs.length === 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "(본문 없음)", italics: true, size: 22 })],
        spacing: { after: 80 },
      }),
    );
  } else {
    for (const p of params.bodyParagraphs) children.push(p);
  }

  children.push(
    new Paragraph({
      pageBreakBefore: true,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "추가 페이지", bold: true, size: 36 })],
      spacing: { after: 120 },
    }),
  );

  if (params.appendixParagraphs.length === 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "(추가 페이지 없음)", italics: true, size: 22 })],
        spacing: { after: 80 },
      }),
    );
  } else {
    for (const p of params.appendixParagraphs) children.push(p);
  }

  if (params.afterwordParagraphs && params.afterwordParagraphs.length > 0) {
    children.push(
      new Paragraph({
        pageBreakBefore: true,
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "꼬리말", bold: true, size: 36 })],
        spacing: { after: 120 },
      }),
    );
    for (const p of params.afterwordParagraphs) children.push(p);
  }

  if (params.backCover) {
    const raster = await rasterImageFileToDocxRaster(params.backCover);
    const dim = scaleCoverToMaxWidth(raster);
    children.push(
      new Paragraph({
        pageBreakBefore: true,
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: raster.type,
            data: raster.data,
            transformation: { width: dim.width, height: dim.height },
          }),
        ],
        spacing: { after: 200 },
      }),
    );
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}

export async function downloadMasterBookDocx(params: Parameters<typeof buildMasterBookDocxBlob>[0]): Promise<void> {
  const blob = await buildMasterBookDocxBlob(params);
  const base = safeDocxFilenamePart(params.bookTitle.trim(), "book");
  triggerDocxDownload(blob, `Xtudy-Universe_Textbook_Master_${base}.docx`);
}

/** 파일 블록들을 제목(H2)+본문 단락으로 변환 (본문 업로드·추가 페이지 공용) */
export function buildSegmentBlocksParagraphs(segments: { fileName: string; text: string }[]): Paragraph[] {
  const out: Paragraph[] = [];
  for (const s of segments) {
    out.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: s.fileName, bold: true })],
        spacing: { before: 160, after: 80 },
      }),
    );
    const lines = s.text.replace(/\r\n/g, "\n").split("\n");
    for (const line of lines) {
      out.push(
        new Paragraph({
          children: [new TextRun({ text: line.length ? line : " ", size: 22 })],
          spacing: { after: 55 },
        }),
      );
    }
  }
  return out;
}
