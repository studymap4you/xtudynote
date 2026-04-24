import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let pdfWorkerConfigured = false;

function ensurePdfWorker(): void {
  if (pdfWorkerConfigured) return;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  pdfWorkerConfigured = true;
}

/** PDF 바이너리에서 페이지별 텍스트만 추출 (브라우저용 pdf.js). */
export async function extractPdfPlainTextFromBuffer(data: ArrayBuffer): Promise<string> {
  ensurePdfWorker();
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let chunk = "";
    for (const item of content.items) {
      if (item && typeof item === "object" && "str" in item && typeof (item as { str: unknown }).str === "string") {
        chunk += (item as { str: string }).str;
      }
    }
    const trimmed = chunk.replace(/\s+/g, " ").trim();
    if (trimmed) parts.push(trimmed);
  }
  return parts.join("\n\n").trim();
}
