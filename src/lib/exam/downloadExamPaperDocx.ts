import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { ExamPaperPdfPayload } from "@/lib/exam/examPaperPdfClient";
import { safeDocxFilenamePart, stripMarkdownBold, triggerDocxDownload } from "@/lib/docx/docxHelpers";

function textPara(
  text: string,
  opts?: { size?: number; bold?: boolean; italics?: boolean; after?: number },
): Paragraph {
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

function bodyLines(raw: string): Paragraph[] {
  const t = stripMarkdownBold(raw).trim();
  if (!t) return [textPara("—", { size: 22, after: 80 })];
  return t.split("\n").map((line) => textPara(line || " ", { size: 22, after: 70 }));
}

export async function downloadExamPaperDocx(payload: ExamPaperPdfPayload): Promise<void> {
  const title = payload.title.trim() || "시험";
  const subject = payload.subject.trim() || "—";
  const teacher = payload.teacherName.trim() || "선생님";
  const examDate = (payload.examDate || "").trim() || "—";
  const studentName = (payload.studentName || "").trim() || "(이름)";
  const studentNo = (payload.studentNo || "").trim() || "(학번)";
  const layoutNote = payload.layout === "2col" ? "2단 (좌우)" : "1단 (세로 한 줄)";

  const blocks: Paragraph[] = [];
  blocks.push(textPara("Xtudy-Universe · AI 시험지", { size: 18, after: 60 }));
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: title, bold: true, size: 36 })],
      spacing: { after: 120 },
    }),
  );
  blocks.push(
    textPara(`과목: ${subject}  |  담당: ${teacher}  |  시행일: ${examDate}  |  레이아웃: ${layoutNote}`, {
      size: 20,
      after: 120,
    }),
  );
  blocks.push(textPara(`학생 이름: ${studentName}    학번(번호): ${studentNo}`, { size: 20, bold: true, after: 200 }));

  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "본문", bold: true })],
      spacing: { before: 80, after: 100 },
    }),
  );
  blocks.push(...bodyLines(payload.passage));

  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "문항", bold: true })],
      spacing: { before: 200, after: 100 },
    }),
  );

  payload.questions.forEach((q, i) => {
    const n = i + 1;
    blocks.push(textPara(`${n}. ${stripMarkdownBold(q.prompt || "").trim() || "(발문 없음)"}`, { bold: true, after: 80 }));
    if (q.type === "mcq" && Array.isArray(q.options)) {
      q.options.forEach((opt, j) => {
        blocks.push(textPara(`${j + 1}) ${stripMarkdownBold(opt ?? "").trim() || "—"}`, { size: 21, after: 55 }));
      });
      blocks.push(textPara("답란: (        )", { bold: true, after: 120 }));
    } else {
      blocks.push(textPara("※ 답안을 아래에 서술하세요.", { italics: true, size: 20, after: 60 }));
      blocks.push(textPara("", { after: 400 }));
    }
  });

  const doc = new Document({ sections: [{ children: blocks }] });
  const blob = await Packer.toBlob(doc);
  const datePart = safeDocxFilenamePart(payload.examDate || "", "exam");
  const titlePart = safeDocxFilenamePart(payload.title || "exam", "exam");
  triggerDocxDownload(blob, `Xtudy-Universe_Exam_${datePart}_${titlePart}.docx`);
}
