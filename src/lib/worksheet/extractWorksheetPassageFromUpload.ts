import mammoth from "mammoth";
import { extractPdfPlainTextFromBuffer } from "@/lib/pdf/extractPdfPlainTextFromBuffer";
import { extractEducationalTextFromImageFile } from "@/lib/worksheet/worksheetAiGeneration";

function isImageFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (file.type && file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp)$/i.test(name);
}

export function isWorksheetPdfUpload(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".pdf") || file.type === "application/pdf";
}

export type WorksheetExtractOptions = {
  /** PDF만 적용. pdfPageList 가 있으면 구간보다 우선 */
  pdfPageFrom?: number;
  /** PDF만 적용. 생략 시 마지막 페이지까지 */
  pdfPageTo?: number;
  /** PDF만 적용. 1-based, 입력 순서 유지·문서 범위 밖·중복 제거는 추출 단계에서 처리 */
  pdfPageList?: number[];
};

/** PDF, DOCX, 이미지에서 학습지 본문용 텍스트를 추출합니다. 이미지는 OpenAI Vision을 사용합니다. */
export async function extractWorksheetPassageFromUpload(
  file: File,
  options?: WorksheetExtractOptions | null,
): Promise<string> {
  const name = file.name.toLowerCase();
  const buf = await file.arrayBuffer();

  if (isImageFile(file)) {
    return (await extractEducationalTextFromImageFile(file)).trim();
  }

  if (isWorksheetPdfUpload(file)) {
    const list = options?.pdfPageList;
    const useList = list != null && list.length > 0;
    const useRange =
      !useList &&
      options != null &&
      (options.pdfPageFrom != null || options.pdfPageTo != null);
    const selection = useList
      ? { pages: list! }
      : useRange
        ? {
            fromPage: options!.pdfPageFrom ?? 1,
            toPage: options!.pdfPageTo,
          }
        : null;
    const t = (await extractPdfPlainTextFromBuffer(buf, selection)).trim();
    return t || "(PDF에서 본문 텍스트를 찾지 못했습니다. 아래 지문란을 직접 채워 주세요.)";
  }

  if (
    name.endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const r = await mammoth.extractRawText({ arrayBuffer: buf });
    const t = (r.value ?? "").trim();
    return t || "(DOCX에서 본문 텍스트를 찾지 못했습니다. 아래 지문란을 직접 채워 주세요.)";
  }

  if (name.endsWith(".doc") || file.type === "application/msword") {
    throw new Error("Word 구버전 .doc 형식은 지원하지 않습니다. DOCX로 저장한 뒤 올려 주세요.");
  }

  throw new Error("지원 형식: PDF, Word(DOCX), 이미지(PNG·JPEG·GIF·WEBP) 입니다.");
}
