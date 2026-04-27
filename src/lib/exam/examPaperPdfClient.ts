function examPaperPdfEndpoint(): string {
  const explicit = import.meta.env.VITE_EXAM_PAPER_PDF_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const pid =
    import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() ||
    import.meta.env.VITE_FIREBASE_PROJECTID?.trim() ||
    "xtudynote";
  return `https://asia-northeast3-${pid}.cloudfunctions.net/generateExamPaperPdf`;
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

export type ExamPaperPdfPayload = {
  title: string;
  subject: string;
  teacherName: string;
  passage: string;
  layout: "1col" | "2col";
  studentName?: string;
  studentNo?: string;
  examDate?: string;
  questions: Array<{ type: "mcq" | "short"; prompt: string; options?: string[] }>;
};

export async function downloadExamPaperPdf(payload: ExamPaperPdfPayload): Promise<void> {
  const endpoint = examPaperPdfEndpoint();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `PDF 오류 (${res.status})`);
  }
  const cd = res.headers.get("Content-Disposition");
  let filename =
    parseFilenameFromDisposition(cd) ||
    `${payload.examDate || ""}_${payload.title || "시험지"}.pdf`;
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
