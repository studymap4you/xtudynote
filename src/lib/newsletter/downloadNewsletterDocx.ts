import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { NewsletterAiResult } from "@/types/newsletter";

function displayBody(raw: string): string {
  return raw.replace(/\\n/g, "\n").replace(/\*\*/g, "");
}

function safeFilenamePart(s: string): string {
  return s.replace(/[/\\?%*:|"<>]/g, "_").trim().slice(0, 80) || "newsletter";
}

function parseImageDataUrl(dataUrl: string): { type: "png" | "jpg"; data: Uint8Array } | null {
  const m = /^data:image\/(png|jpeg|jpg);base64,([\s\S]+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const type: "png" | "jpg" = kind === "png" ? "png" : "jpg";
  const b64 = m[2].replace(/\s/g, "");
  try {
    const binary = atob(b64);
    const data = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
    return { type, data };
  } catch {
    return null;
  }
}

function loadImageDimensions(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("이미지 크기를 읽지 못했습니다."));
    img.src = dataUrl;
  });
}

async function imageParagraph(dataUrl: string, widthPercent: number): Promise<Paragraph> {
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed) {
    return new Paragraph({
      children: [new TextRun({ text: "[이미지를 넣을 수 없습니다]", italics: true })],
      spacing: { after: 120 },
    });
  }
  let nw: number;
  let nh: number;
  try {
    const dim = await loadImageDimensions(dataUrl);
    nw = dim.w;
    nh = dim.h;
  } catch {
    nw = 800;
    nh = 600;
  }
  const maxW = Math.min(520, Math.round((520 * Math.min(100, Math.max(25, widthPercent))) / 100));
  const scale = maxW / Math.max(nw, 1);
  const tw = Math.max(1, Math.round(nw * scale));
  const th = Math.max(1, Math.round(nh * scale));
  return new Paragraph({
    children: [
      new ImageRun({
        type: parsed.type,
        data: parsed.data,
        transformation: {
          width: tw,
          height: th,
        },
      }),
    ],
    spacing: { after: 200 },
  });
}

function bodyParagraphs(text: string): Paragraph[] {
  const lines = displayBody(text).split("\n");
  return lines.map(
    (line) =>
      new Paragraph({
        children: [new TextRun({ text: line.length > 0 ? line : " ", size: 22 })],
        spacing: { after: 80 },
      }),
  );
}

/** Google Docs에서 열기 좋은 Word 문서로 저장 */
export async function downloadNewsletterDocx(args: {
  data: NewsletterAiResult;
  teacherName: string;
  issueLabel: string;
}): Promise<void> {
  const { data, teacherName, issueLabel } = args;
  const blocks: Paragraph[] = [];

  blocks.push(
    new Paragraph({
      children: [new TextRun({ text: "Xtudy-Universe · Learning Newsletter", size: 18, color: "64748B" })],
      spacing: { after: 60 },
    }),
  );
  blocks.push(
    new Paragraph({
      children: [new TextRun({ text: `담당 ${teacherName}  |  ${issueLabel}`, size: 18, color: "64748B" })],
      spacing: { after: 240 },
    }),
  );

  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: data.titleKo, bold: true, size: 36 })],
      spacing: { after: 280 },
    }),
  );

  for (const s of data.sections) {
    blocks.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: s.headingKo, bold: true, color: "1E40AF", size: 26 })],
        spacing: { before: 200, after: 120 },
      }),
    );
    if (s.imageDataUrl) {
      blocks.push(await imageParagraph(s.imageDataUrl, s.imageWidthPercent ?? 100));
    }
    blocks.push(...bodyParagraphs(s.bodyKo));
  }

  blocks.push(
    new Paragraph({
      children: [new TextRun({ text: "Xtudy-Universe · Learning Newsletter", size: 18, color: "94A3B8" })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
    }),
  );

  const doc = new Document({
    sections: [{ children: blocks }],
  });

  const blob = await Packer.toBlob(doc);
  const name = `Xtudy-Universe_Newsletter_${safeFilenamePart(data.titleKo)}.docx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
