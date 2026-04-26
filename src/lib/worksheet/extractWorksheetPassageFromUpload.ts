import mammoth from "mammoth";
import { extractPdfPlainTextFromBuffer } from "@/lib/pdf/extractPdfPlainTextFromBuffer";

/** PDF/DOCX에서 지문용 본문 텍스트만 추출합니다. */
export async function extractWorksheetPassageFromUpload(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buf = await file.arrayBuffer();

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const t = (await extractPdfPlainTextFromBuffer(buf)).trim();
    return t || "(PDF에서 본문 텍스트를 찾지 못했습니다. 아래 지문란을 직접 채워 주세요.)";
  }

  if (name.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const r = await mammoth.extractRawText({ arrayBuffer: buf });
    const t = (r.value ?? "").trim();
    return t || "(DOCX에서 본문 텍스트를 찾지 못했습니다. 아래 지문란을 직접 채워 주세요.)";
  }

  throw new Error("지원 형식: PDF, DOCX 입니다.");
}
