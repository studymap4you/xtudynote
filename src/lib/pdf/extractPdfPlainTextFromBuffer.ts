import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let pdfWorkerConfigured = false;

function ensurePdfWorker(): void {
  if (pdfWorkerConfigured) return;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  pdfWorkerConfigured = true;
}

/** PDF 바이너리에서 페이지 범위(1-based, 끝 포함)의 텍스트만 추출. range 가 없으면 전체 페이지. */
export async function extractPdfPlainTextFromBuffer(
  data: ArrayBuffer,
  pageRange?: { fromPage?: number; toPage?: number } | null,
): Promise<string> {
  ensurePdfWorker();
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  let start = 1;
  let end = numPages;
  if (pageRange && (pageRange.fromPage != null || pageRange.toPage != null)) {
    start = pageRange.fromPage != null ? Math.max(1, Math.floor(pageRange.fromPage)) : 1;
    end = pageRange.toPage != null ? Math.floor(pageRange.toPage) : numPages;
    if (start > numPages) start = numPages;
    if (end > numPages) end = numPages;
    if (end < start) end = start;
  }
  const parts: string[] = [];
  for (let i = start; i <= end; i++) {
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
