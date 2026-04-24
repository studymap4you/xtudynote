import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const MIME_GOOGLE_DOC = "application/vnd.google-apps.document";
const MIME_PDF = "application/pdf";

let pdfWorkerConfigured = false;

function ensurePdfWorker(): void {
  if (pdfWorkerConfigured) return;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  pdfWorkerConfigured = true;
}

async function fetchDriveMimeType(fileId: string, accessToken: string): Promise<string> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("fields", "mimeType,name");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Drive metadata failed (${res.status})`);
  }
  const j = (await res.json()) as { mimeType?: string };
  return (j.mimeType ?? "").trim();
}

async function exportGoogleDocPlain(fileId: string, accessToken: string): Promise<string> {
  const exportUrl = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export`,
  );
  exportUrl.searchParams.set("mimeType", "text/plain");
  const res = await fetch(exportUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Docs export failed (${res.status})`);
  }
  return res.text();
}

async function downloadDriveMedia(fileId: string, accessToken: string): Promise<ArrayBuffer> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("alt", "media");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Drive download failed (${res.status})`);
  }
  return res.arrayBuffer();
}

async function extractPdfPlainText(data: ArrayBuffer): Promise<string> {
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

/**
 * Google Docs → plain text export. Drive-hosted PDF → pdf.js text extraction.
 */
export async function fetchDriveFilePlainText(
  fileId: string,
  mimeHint: string | undefined,
  accessToken: string,
): Promise<string> {
  let mime = (mimeHint ?? "").trim();
  if (!mime) {
    mime = await fetchDriveMimeType(fileId, accessToken);
  }
  if (mime === MIME_GOOGLE_DOC) {
    return exportGoogleDocPlain(fileId, accessToken);
  }
  if (mime === MIME_PDF) {
    const buf = await downloadDriveMedia(fileId, accessToken);
    return extractPdfPlainText(buf);
  }
  throw new Error(
    `지원 형식이 아닙니다: ${mime || "알 수 없음"}. Google 문서 또는 Google Drive에 올린 PDF만 가져올 수 있습니다.`,
  );
}
