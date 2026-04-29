function englishPassagePdfEndpoint(): string {
  const explicit = import.meta.env.VITE_ENGLISH_PASSAGE_PDF_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const pid =
    import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() ||
    import.meta.env.VITE_FIREBASE_PROJECTID?.trim() ||
    "xtudynote";
  return `https://asia-northeast3-${pid}.cloudfunctions.net/generateEnglishPassagePdf`;
}

function parseFilenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=UTF-8''([^;\s]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].replace(/"/g, ""));
    } catch {
      return star[1];
    }
  }
  const q = /filename="([^"]+)"/i.exec(header);
  return q?.[1] ?? null;
}

export type EnglishPassagePdfPayload = {
  documentType?: "english_worksheet" | "newsletter";
  title: string;
  teacherName: string;
  /** 워크시트 전용 통째 지문 / 뉴스레터는 빈 문자열 가능 */
  passage?: string;
  layout?: "1col" | "2col";
  examDate?: string;
  vocabulary?: { word: string; meaning: string }[];
  sentences?: Array<{
    english: string;
    koreanFull: string;
  }>;
  newsletterSections?: Array<{
    heading: string;
    body: string;
    imageDataUrl?: string;
    imageWidthPercent?: number;
  }>;
};

export async function downloadEnglishPassagePdf(payload: EnglishPassagePdfPayload): Promise<void> {
  const endpoint = englishPassagePdfEndpoint();
  const docType = payload.documentType ?? "english_worksheet";
  const body: Record<string, unknown> = {
    documentType: docType,
    title: payload.title,
    teacherName: payload.teacherName,
    passage: payload.passage ?? "",
    layout: payload.layout ?? "1col",
    examDate: payload.examDate ?? "",
    vocabulary: payload.vocabulary ?? [],
    sentences: payload.sentences ?? [],
  };
  if (docType === "newsletter" && payload.newsletterSections?.length) {
    body.newsletterSections = payload.newsletterSections;
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `PDF 오류 (${res.status})`);
  }
  const cd = res.headers.get("Content-Disposition");
  let filename =
    parseFilenameFromDisposition(cd) ||
    `${payload.examDate || ""}_${payload.title || "영어학습"}.pdf`;
  filename = filename.replace(/[/\\?%*:|"<>]/g, "_");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 뉴스레터 PDF — generateEnglishPassagePdf Cloud Function (documentType: newsletter) */
export async function downloadNewsletterPdf(args: {
  title: string;
  teacherName: string;
  examDate?: string;
  newsletterSections: Array<{
    heading: string;
    body: string;
    imageDataUrl?: string;
    imageWidthPercent?: number;
  }>;
}): Promise<void> {
  return downloadEnglishPassagePdf({
    documentType: "newsletter",
    title: args.title,
    teacherName: args.teacherName,
    passage: "",
    layout: "1col",
    examDate: args.examDate,
    vocabulary: [],
    sentences: [],
    newsletterSections: args.newsletterSections,
  });
}
