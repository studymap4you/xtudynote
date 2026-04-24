import mammoth from "mammoth";
import { extractPdfPlainTextFromBuffer } from "@/lib/pdf/extractPdfPlainTextFromBuffer";

const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function extensionLower(file: File): string {
  const n = file.name;
  const i = n.lastIndexOf(".");
  return i >= 0 ? n.slice(i).toLowerCase() : "";
}

/**
 * 로컬 파일(.txt / .pdf / .docx)에서 본문 텍스트만 추출합니다.
 */
export async function extractPlainTextFromLocalFile(file: File): Promise<string> {
  const ext = extensionLower(file);
  const mime = (file.type || "").toLowerCase();

  if (ext === ".txt" || mime === "text/plain") {
    return (await file.text()).replace(/^\uFEFF/, "");
  }

  if (ext === ".pdf" || mime === "application/pdf") {
    const buf = await file.arrayBuffer();
    return extractPdfPlainTextFromBuffer(buf);
  }

  if (ext === ".docx" || mime === MIME_DOCX) {
    const buf = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
    return (value || "").trim();
  }

  throw new Error("지원 형식은 .txt, .pdf, .docx 입니다.");
}
