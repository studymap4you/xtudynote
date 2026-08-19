import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { extractPdfPlainTextFromBuffer } from "@/lib/pdf/extractPdfPlainTextFromBuffer";

const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function extensionLower(file: File): string {
  const n = file.name;
  const i = n.lastIndexOf(".");
  return i >= 0 ? n.slice(i).toLowerCase() : "";
}

/**
 * 로컬 문서에서 AI 입력에 사용할 본문 텍스트를 추출합니다.
 */
export async function extractPlainTextFromLocalFile(file: File): Promise<string> {
  const ext = extensionLower(file);
  const mime = (file.type || "").toLowerCase();

  if ([".txt", ".md", ".csv", ".tsv", ".json", ".html", ".htm"].includes(ext) || mime.startsWith("text/")) {
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

  if ([".xlsx", ".xls"].includes(ext) || mime.includes("spreadsheet") || mime.includes("excel")) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    return workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      return `[시트: ${sheetName}]\n${XLSX.utils.sheet_to_csv(sheet, { FS: "\t" })}`;
    }).join("\n\n");
  }

  throw new Error("자동 본문 추출은 TXT, MD, CSV, JSON, PDF, DOCX, XLS, XLSX 파일을 지원합니다.");
}
