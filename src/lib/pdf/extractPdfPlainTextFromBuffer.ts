import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let pdfWorkerConfigured = false;

function ensurePdfWorker(): void {
  if (pdfWorkerConfigured) return;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  pdfWorkerConfigured = true;
}

/** 연속 구간(from~to) 또는 1-based 페이지 번호 목록(순서·중복 제거 후). 없으면 전체 페이지. */
export type PdfPlainTextSelection =
  | { fromPage?: number; toPage?: number }
  | { pages: number[] }
  | null
  | undefined;

function normalizePdfPageList(raw: number[], numPages: number): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const n0 of raw) {
    const p = Math.max(1, Math.floor(Number(n0)));
    if (p > numPages) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

async function extractPagePlainText(pdf: pdfjs.PDFDocumentProxy, pageIndex1: number): Promise<string> {
  const page = await pdf.getPage(pageIndex1);
  const content = await page.getTextContent();
  let chunk = "";
  for (const item of content.items) {
    if (item && typeof item === "object" && "str" in item && typeof (item as { str: unknown }).str === "string") {
      chunk += (item as { str: string }).str;
    }
  }
  return chunk.replace(/\s+/g, " ").trim();
}

/** PDF 바이너리에서 텍스트 추출. selection 이 없으면 전체 페이지. */
export async function extractPdfPlainTextFromBuffer(
  data: ArrayBuffer,
  selection?: PdfPlainTextSelection,
): Promise<string> {
  ensurePdfWorker();
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  const listMode =
    selection != null &&
    typeof selection === "object" &&
    "pages" in selection &&
    Array.isArray(selection.pages) &&
    selection.pages.length > 0;

  if (listMode) {
    const indices = normalizePdfPageList((selection as { pages: number[] }).pages, numPages);
    const parts: string[] = [];
    for (const i of indices) {
      const trimmed = await extractPagePlainText(pdf, i);
      if (trimmed) parts.push(trimmed);
    }
    return parts.join("\n\n").trim();
  }

  let start = 1;
  let end = numPages;
  const range = selection as { fromPage?: number; toPage?: number } | null | undefined;
  if (range && (range.fromPage != null || range.toPage != null)) {
    start = range.fromPage != null ? Math.max(1, Math.floor(range.fromPage)) : 1;
    end = range.toPage != null ? Math.floor(range.toPage) : numPages;
    if (start > numPages) start = numPages;
    if (end > numPages) end = numPages;
    if (end < start) end = start;
  }
  const parts: string[] = [];
  for (let i = start; i <= end; i++) {
    const trimmed = await extractPagePlainText(pdf, i);
    if (trimmed) parts.push(trimmed);
  }
  return parts.join("\n\n").trim();
}
