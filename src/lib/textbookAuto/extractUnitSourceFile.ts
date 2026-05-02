import mammoth from "mammoth";
import { extractPdfPlainTextFromBuffer, type PdfPlainTextSelection } from "@/lib/pdf/extractPdfPlainTextFromBuffer";
import { parseCommaSeparatedPdfPages } from "@/lib/pdf/parseCommaSeparatedPdfPages";

const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function extensionLower(file: File): string {
  const n = file.name;
  const i = n.lastIndexOf(".");
  return i >= 0 ? n.slice(i).toLowerCase() : "";
}

export type ExtractUnitFileOptions = {
  mode: "all" | "range" | "pages";
  /** 1-based, inclusive (구간 모드) */
  fromPage?: number;
  toPage?: number;
  /** 쉼표로 구분한 1-based 페이지 번호 (예: 1, 4, 7) */
  pagesRaw?: string;
};

/**
 * 교재 단원용: PDF는 구간·페이지 목록·전체, 그 외 형식은 전체 텍스트만.
 */
export async function extractUnitSourceFile(
  file: File,
  opts: ExtractUnitFileOptions,
): Promise<{ text: string; extractNote: string }> {
  const ext = extensionLower(file);
  const mime = (file.type || "").toLowerCase();

  if (ext === ".pdf" || mime === "application/pdf") {
    const buf = await file.arrayBuffer();
    let selection: PdfPlainTextSelection = undefined;
    let extractNote = file.name;

    if (opts.mode === "range") {
      const from = opts.fromPage != null && opts.fromPage > 0 ? Math.floor(opts.fromPage) : undefined;
      const to = opts.toPage != null && opts.toPage > 0 ? Math.floor(opts.toPage) : undefined;
      if (from != null || to != null) {
        selection = { fromPage: from, toPage: to };
        extractNote = `${file.name} · p.${from ?? 1}–${to ?? "끝"}`;
      } else {
        extractNote = `${file.name} · 전체`;
      }
    } else if (opts.mode === "pages") {
      const raw = (opts.pagesRaw ?? "").trim();
      const parsed = parseCommaSeparatedPdfPages(raw);
      if (parsed === "invalid") {
        throw new Error("페이지 목록이 올바르지 않습니다. 예: 1, 3, 5 (1 이상 정수)");
      }
      if (parsed === "empty") {
        selection = undefined;
        extractNote = `${file.name} · 전체`;
      } else {
        selection = { pages: parsed };
        extractNote = `${file.name} · p.${parsed.join(", ")}`;
      }
    } else {
      extractNote = `${file.name} · 전체`;
    }

    const text = await extractPdfPlainTextFromBuffer(buf, selection);
    return { text: text.trim(), extractNote };
  }

  if (ext === ".txt" || mime === "text/plain") {
    const text = (await file.text()).replace(/^\uFEFF/, "");
    return { text: text.trim(), extractNote: `${file.name} · TXT` };
  }

  if (ext === ".docx" || mime === MIME_DOCX) {
    const buf = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
    return { text: (value || "").trim(), extractNote: `${file.name} · DOCX` };
  }

  throw new Error("지원 형식은 .txt, .pdf, .docx 입니다.");
}
